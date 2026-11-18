# 쿨메신저 비서 - 정리 엔진 (화면 없이 뒤에서 돌아요)
# 쿨메신저가 PC에 저장해 둔 받은 쪽지를 복사본으로 읽고, 새 쪽지를 제미나이에게 보내 정리합니다.
param([int]$ParentPid = 0, [switch]$Once)
. (Join-Path $PSScriptRoot 'common.ps1')
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$engineMutex = New-Object Threading.Mutex($false, 'Local\CoolAIEngine')
if (-not $engineMutex.WaitOne(0)) { exit }
$stopEvent = New-Object Threading.EventWaitHandle($false, 'ManualReset', 'Local\CoolAIStop')

# ── 윈도우에 들어 있는 SQLite(winsqlite3.dll)로 쪽지 파일 읽기 ──
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CoolSqlite {
    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Unicode)]
    static extern int sqlite3_open16(string filename, out IntPtr db);
    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.StdCall)]
    static extern int sqlite3_close(IntPtr db);
    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Unicode)]
    static extern int sqlite3_prepare16_v2(IntPtr db, string sql, int nByte, out IntPtr stmt, IntPtr tail);
    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.StdCall)]
    static extern int sqlite3_step(IntPtr stmt);
    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.StdCall)]
    static extern int sqlite3_column_count(IntPtr stmt);
    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.StdCall)]
    static extern IntPtr sqlite3_column_text16(IntPtr stmt, int col);
    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.StdCall)]
    static extern int sqlite3_finalize(IntPtr stmt);
    [DllImport("winsqlite3.dll", CallingConvention = CallingConvention.StdCall)]
    static extern IntPtr sqlite3_errmsg16(IntPtr db);

    public static List<string[]> Query(string path, string sql) {
        IntPtr db;
        if (sqlite3_open16(path, out db) != 0) throw new Exception("쪽지 파일을 열 수 없어요");
        try {
            IntPtr st;
            if (sqlite3_prepare16_v2(db, sql, -1, out st, IntPtr.Zero) != 0)
                throw new Exception("SQLite: " + Marshal.PtrToStringUni(sqlite3_errmsg16(db)));
            var rows = new List<string[]>();
            try {
                int n = sqlite3_column_count(st);
                while (true) {
                    int rc = sqlite3_step(st);
                    if (rc == 101) break;           // SQLITE_DONE
                    if (rc != 100) throw new Exception("SQLite: " + Marshal.PtrToStringUni(sqlite3_errmsg16(db)));
                    var r = new string[n];
                    for (int i = 0; i < n; i++) {
                        IntPtr p = sqlite3_column_text16(st, i);
                        r[i] = p == IntPtr.Zero ? "" : Marshal.PtrToStringUni(p);
                    }
                    rows.Add(r);
                }
            } finally { sqlite3_finalize(st); }
            return rows;
        } finally { sqlite3_close(db); }
    }
}
'@

$TmpDir = Join-Path $AppDir 'tmp'
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null
$TmpDb = Join-Path $TmpDir 'm.udb'

function Set-Status($state, $msg) {
    Write-JsonFile $StatusJson ([ordered]@{ state = $state; msg = $msg; time = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') })
}

function Find-CoolDb {
    $memo = Join-Path $env:LOCALAPPDATA 'CoolMessenger\Memo'
    if (-not (Test-Path $memo)) { return $null }
    Get-ChildItem $memo -Filter '*.udb' -File | Where-Object { $_.Extension -eq '.udb' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

function Copy-Shared($src, $dst) {
    # 쿨메신저가 쓰고 있어도 읽을 수 있게 '같이 쓰기' 모드로 복사
    $in = [IO.File]::Open($src, 'Open', 'Read', 'ReadWrite, Delete')
    try {
        $out = [IO.File]::Create($dst)
        try { $in.CopyTo($out) } finally { $out.Close() }
    } finally { $in.Close() }
}

function Get-DbSignature($db) {
    $sig = "$($db.LastWriteTimeUtc.Ticks)/$($db.Length)"
    $wal = "$($db.FullName)-wal"
    if (Test-Path $wal) { $w = Get-Item $wal; $sig += "|$($w.LastWriteTimeUtc.Ticks)/$($w.Length)" }
    return $sig
}

function Copy-CoolDb($db) {
    foreach ($ext in '', '-wal', '-shm') { if (Test-Path "$TmpDb$ext") { Remove-Item "$TmpDb$ext" -Force } }
    Copy-Shared $db.FullName $TmpDb
    if (Test-Path "$($db.FullName)-wal") { Copy-Shared "$($db.FullName)-wal" "$TmpDb-wal" }
}

function Clean-Text($t) {
    if (-not $t) { return '' }
    $t = $t -replace "`r", '' -replace '[ \t]+\n', "`n" -replace '\n{3,}', "`n`n"
    return $t.Trim()
}

# ── 제미나이 부르기 ──
function Invoke-Gemini($key, $model, $prompt) {
    $schema = @{
        type = 'OBJECT'; required = @('items')
        properties = @{ items = @{ type = 'ARRAY'; items = @{
            type = 'OBJECT'; required = @('msg', 'kind', 'text', 'due', 'time')
            properties = @{
                msg  = @{ type = 'INTEGER' }
                kind = @{ type = 'STRING'; enum = @('todo', 'note', 'remember') }
                text = @{ type = 'STRING' }
                due  = @{ type = 'STRING' }
                time = @{ type = 'STRING' }
            } } } }
    }
    # 생각하기를 끄면 훨씬 빨라요 (켜 두면 무료 서버에서 몇 분씩 걸리기도 해요)
    $gen = @{ temperature = 0.2; responseMimeType = 'application/json'; responseSchema = $schema }
    if (-not $Script:NoThinkUnsupported) { $gen.thinkingConfig = @{ thinkingBudget = 0 } }
    $body = ConvertTo-Json -Depth 20 -Compress -InputObject @{
        contents = @(@{ role = 'user'; parts = @(@{ text = $prompt }) })
        generationConfig = $gen
    }
    $url = "https://generativelanguage.googleapis.com/v1beta/models/$($model):generateContent"
    $req = [Net.HttpWebRequest]::Create($url)
    $req.Method = 'POST'
    $req.ContentType = 'application/json; charset=utf-8'
    $req.Headers.Add('x-goog-api-key', $key)
    $req.Timeout = 300000; $req.ReadWriteTimeout = 300000
    $bytes = [Text.Encoding]::UTF8.GetBytes($body)
    $rs = $req.GetRequestStream(); $rs.Write($bytes, 0, $bytes.Length); $rs.Close()
    try { $resp = $req.GetResponse() }
    catch {
        $we = $_.Exception
        while ($we -and -not ($we -is [Net.WebException])) { $we = $we.InnerException }
        if (-not $we -or -not $we.Response) { throw "제미나이 연결이 안 돼요 ($($_.Exception.InnerException.Message))" }
        $resp = $we.Response
    }
    $code = [int]$resp.StatusCode
    $sr = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
    $txt = $sr.ReadToEnd(); $resp.Close()
    if ($code -eq 400 -and -not $Script:NoThinkUnsupported) {
        # 생각 끄기를 못 하는 모델이면 켠 채로 다시
        $Script:NoThinkUnsupported = $true
        return (Invoke-Gemini $key $model $prompt)
    }
    if ($code -ne 200) { return @{ code = $code; error = $txt } }
    $j = ConvertFrom-Json $txt
    $out = ''
    foreach ($p in $j.candidates[0].content.parts) { if ($p.text -and -not $p.thought) { $out += $p.text } }
    return @{ code = 200; data = (ConvertFrom-Json $out) }
}

function Build-Prompt($batch, $settings) {
    $today = Get-Date
    $dow = '일월화수목금토'[[int]$today.DayOfWeek]
    $me = $settings['내_정보']
    $sb = New-Object Text.StringBuilder
    [void]$sb.AppendLine("너는 초등학교 선생님의 업무 비서야. 아래는 선생님이 학교 메신저(쿨메신저)로 받은 쪽지들이야.")
    [void]$sb.AppendLine("오늘은 $($today.ToString('yyyy-MM-dd'))($dow)이야.")
    if ($me) { [void]$sb.AppendLine("선생님 정보: $me. 이 선생님과 관계없는 학년·업무 대상 내용은 빼.") }
    [void]$sb.AppendLine(@'
각 쪽지에서 선생님에게 필요한 것만 뽑아 아래 셋 중 하나로 분류해.
- todo (해야 할 일): 선생님이 직접 해야 하는 일. 제출, 회신, 입력, 신청, 확인, 준비, 학생에게 안내하기 등.
- note (적어야 할 것): 달력·수첩에 적어 둘 일정·장소·시간·숫자. 회의, 행사, 연수, 출장, 시험, 공사·정전 일정 등.
- remember (기억할 것): 앞으로 알아 두어야 할 안내·규칙·바뀐 점. 해야 할 일은 없지만 알고 있어야 하는 것.
규칙:
- 날짜나 기한이 오늘 이전에 이미 끝난 것은 절대 넣지 마. 오늘이 기한이거나 오늘 일정이면 넣어.
- 기한이 적혀 있지 않아도 내용상 이미 지나간 일(지난 행사 결과, 끝난 설문, 지난 주 일정)은 빼.
- 단순 인사, 감사, 광고, 할 일 없는 단순 파일 전달, 이미 처리했다는 회신은 아무것도 뽑지 마.
- 한 쪽지에서 여러 개가 나올 수 있어. 같은 내용을 todo와 note에 겹쳐 넣지 마 (마감이 있는 할 일은 todo 하나로).
- text는 35자 안팎의 짧은 한국어로, 무엇을 하면 되는지 바로 알 수 있게 써. 예: "개인정보 점검표 작성해 교무부 제출", "6교시 후 협의회(2층 회의실)"
- due는 기한·일정 날짜 YYYY-MM-DD, 없으면 "". 연도가 없으면 받은 날짜 다음으로 가장 가까운 날짜로. time은 HH:MM, 없으면 "".
- 학생 이름은 그 학생에 대해 선생님이 뭔가 해야 할 때(예: 생기부 확인, 반납 안내, 상담)처럼 꼭 필요하면 써도 돼. 전화번호·주민번호·주소·건강 정보 같은 민감한 정보는 쓰지 마.
- ★즐겨찾기 쪽지는 선생님이 중요하다고 표시해 둔 거야. 오래된 쪽지여도 지금도 쓸모 있는 내용(규칙, 절차, 안내, 자료 위치, 연락처 종류 등)은 remember로 꼭 넣어. 다만 이미 끝난 일정·마감은 빼. 받은 지 한 달이 넘은 즐겨찾기 쪽지의 기한 없는 할 일은 이미 했을 수 있으니 todo 말고 remember로 넣어.
- msg에는 쪽지 번호를 그대로 적어. 뽑을 게 하나도 없으면 items를 빈 배열로.

쪽지들:
'@)
    foreach ($m in $batch) {
        $star = if ($m.fav) { " | ★즐겨찾기" } else { "" }
        [void]$sb.AppendLine("=== 쪽지 번호 $($m.key) | 받은 때 $($m.date) | 보낸 사람 $($m.sender)$star ===")
        [void]$sb.AppendLine("제목: $($m.title)")
        if ($m.files) { [void]$sb.AppendLine("첨부: $($m.files)") }
        [void]$sb.AppendLine($m.body)
        [void]$sb.AppendLine()
    }
    return $sb.ToString()
}

# ── 한 번 확인하기 ──
function Invoke-Check {
    $settings = Read-Settings
    $key = $settings['API키']
    if (-not $key) { Set-Status 'nokey' '⚙ 설정에서 제미나이 API 키를 넣어 주세요'; return 'wait' }
    $db = Find-CoolDb
    if (-not $db) { Set-Status 'error' '쿨메신저 쪽지 파일을 찾지 못했어요'; return 'wait' }

    $state = Read-JsonFile $StateJson $null
    if (-not $state -or $state.db -ne $db.Name -or -not $state.since) {
        # 처음: 며칠 전부터 볼지 정하기 (날짜 글자는 꼭 2026/11/18 모양으로 — 한국어 윈도우는 '/'를 '-'로 바꿔 버림)
        $days = 7; [void][int]::TryParse($settings['처음_살펴볼_날짜'], [ref]$days)
        $since = (Get-Date).AddDays(-$days).ToString('yyyy\/MM\/dd', [Globalization.CultureInfo]::InvariantCulture)
        $state = [pscustomobject]@{ db = $db.Name; since = $since; lastKey = -1; favDone = @(); sig = '' }
        Write-Log "처음 시작: $since 부터 + 즐겨찾기 쪽지"
    }
    $favDone = @{}; foreach ($k in @($state.favDone)) { if ($null -ne $k) { $favDone[[string]$k] = $true } }

    $sig = Get-DbSignature $db
    $force = Test-Path $ForceFile
    if ($force) { Remove-Item $ForceFile -Force -ErrorAction SilentlyContinue }
    if ($sig -eq $state.sig -and -not $force) { return 'idle' }

    Copy-CoolDb $db
    $last = [int64]$state.lastKey
    $cols = "MessageKey, ReceiveDate, Sender, Title, MessageText, IFNULL(FilePath,''), IFNULL(IsChecked,0)"
    # ① 새 쪽지: 기준 날짜 이후이거나 즐겨찾기(IsChecked=1)인 것
    $newWhere = "MessageKey > $last AND (substr(ReceiveDate,1,10) >= '$($state.since)' OR IsChecked = 1)"
    $rows = @([CoolSqlite]::Query($TmpDb, "SELECT $cols FROM tbl_recv WHERE $newWhere ORDER BY MessageKey LIMIT 300"))
    $total = [int][CoolSqlite]::Query($TmpDb, "SELECT COUNT(*) FROM tbl_recv WHERE $newWhere")[0][0]
    # ② 예전 쪽지인데 나중에 즐겨찾기한 것 (기간 상관없이)
    if ($rows.Count -lt 300) {
        foreach ($r in [CoolSqlite]::Query($TmpDb, "SELECT $cols FROM tbl_recv WHERE IsChecked = 1 AND MessageKey <= $last ORDER BY MessageKey DESC")) {
            if (-not $favDone.ContainsKey([string]$r[0]) -and $rows.Count -lt 300) { $rows += , $r; $total++ }
        }
    }
    # 새 쪽지가 없어도 다음번 확인 범위를 줄이기 위해 마지막 번호는 앞으로 옮겨 두기
    $maxKey = [int64][CoolSqlite]::Query($TmpDb, "SELECT IFNULL(MAX(MessageKey),0) FROM tbl_recv")[0][0]
    if ($rows.Count -eq 0) {
        if ($maxKey -gt $last) { $state.lastKey = $maxKey }
        $state.sig = $sig; Write-JsonFile $StateJson $state
        Set-Status 'ok' '새 쪽지 없음'
        return 'idle'
    }

    $skip = @($settings['제외할_보낸사람'] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $msgs = New-Object Collections.ArrayList
    foreach ($r in $rows) {
        $body = Clean-Text $r[4]
        # 첨부 칸 모양: |개수|크기들|폴더|파일이름|…  → 파일 이름만 골라내기
        $files = (@($r[5] -split '\|' | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '\.[A-Za-z0-9]{2,5}$' -and $_ -notmatch '\\' }) -join ', ')
        $sender = $r[2]
        $isSkip = $false
        foreach ($s in $skip) { if ($sender -like "*$s*") { $isSkip = $true } }
        if ($body.Length -gt 3000) { $body = $body.Substring(0, 3000) + ' …(뒤는 생략)' }
        $fav = ($r[6] -eq '1')
        if ($fav) { $isSkip = $false }   # 즐겨찾기는 제외할 보낸 사람이어도 읽기
        [void]$msgs.Add([pscustomobject]@{ key = [int64]$r[0]; date = $r[1]; sender = $sender; title = $r[3]; body = $body; files = $files; fav = $fav; skip = ($isSkip -or ($body -eq '' -and $r[3] -eq '')) })
    }

    $items = New-Object Collections.ArrayList
    foreach ($it in @(Read-JsonFile $ItemsJson @())) { [void]$items.Add($it) }
    $origin = Read-JsonFile $MsgsJson ([pscustomobject]@{})
    $model = if ($settings['모델']) { $settings['모델'] } else { 'gemini-flash-lite-latest' }

    # 쪽지 12통(또는 글자 2만 자)씩 묶어서 보내기 (무료는 하루 요청 횟수가 적어요)
    $i = 0; $done = 0; $added = 0
    while ($i -lt $msgs.Count) {
        if ($stopEvent.WaitOne(0)) { return 'stop' }
        $batch = New-Object Collections.ArrayList; $chars = 0; $taken = New-Object Collections.ArrayList
        while ($i -lt $msgs.Count -and $batch.Count -lt 12 -and $chars -lt 20000) {
            $m = $msgs[$i]; [void]$taken.Add($m); $i++
            if (-not $m.skip) { [void]$batch.Add($m); $chars += $m.body.Length }
        }
        if ($batch.Count -gt 0) {
            Set-Status 'working' ("쪽지 정리하는 중… ({0}/{1})" -f ($done + $batch.Count), $total)
            $res = $null
            for ($try = 0; $try -lt 4; $try++) {
                $res = Invoke-Gemini $key $model (Build-Prompt $batch $settings)
                if ($res.code -eq 200) { break }
                Write-Log "제미나이 오류 $($res.code): $($res.error)"
                if ($res.code -eq 429) {
                    if ($res.error -match 'PerDay') { Set-Status 'error' '오늘 무료 사용량을 다 썼어요. 내일 이어서 정리해요'; return 'quota' }
                    Set-Status 'working' '무료 사용량 때문에 1분 쉬었다가 이어서 해요'
                    Start-Sleep -Seconds 60
                } elseif ($res.code -ge 500) { Start-Sleep -Seconds 20 }
                else { break }
            }
            if ($res.code -ne 200) {
                $why = if ($res.error -match 'API_KEY_INVALID|API key not valid') { 'API 키가 맞지 않아요. ⚙ 설정에서 확인해 주세요' }
                       elseif ($res.code -eq 404) { "모델 이름($model)이 없어요. ⚙ 설정에서 확인해 주세요" }
                       elseif ($res.code -eq 403) { 'API 키 권한이 없어요. ⚙ 설정에서 확인해 주세요' }
                       else { "제미나이가 응답하지 않아요 (오류 $($res.code)). 잠시 후 다시 해요" }
                Set-Status 'error' $why
                return 'error'
            }
            $byKey = @{}; foreach ($m in $batch) { $byKey[[string]$m.key] = $m }
            $n = 0
            foreach ($x in @($res.data.items)) {
                $m = $byKey[[string]$x.msg]
                if (-not $m -or -not $x.text) { continue }
                $dup = $false
                foreach ($old in $items) { if ($old.text -eq $x.text -and $old.due -eq $x.due) { $dup = $true; break } }
                if ($dup) { continue }
                $due = if ($x.due -match '^\d{4}-\d{2}-\d{2}$') { $x.due } else { '' }
                $time = if ($x.time -match '^\d{1,2}:\d{2}$') { $x.time } else { '' }
                [void]$items.Add([pscustomobject]@{
                    id = "$($m.key)-$n"; msg = $m.key; kind = $x.kind; text = $x.text; due = $due; time = $time; fav = $m.fav
                    sender = $m.sender; recv = $m.date.Substring(0, [Math]::Min(16, $m.date.Length)); added = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
                })
                $origin | Add-Member -NotePropertyName ([string]$m.key) -NotePropertyValue ([pscustomobject]@{ date = $m.date; sender = $m.sender; title = $m.title; body = $m.body; files = $m.files }) -Force
                $n++; $added++
            }
            Write-JsonFile $MsgsJson $origin
            Write-JsonFile $ItemsJson @($items)
            $done += $batch.Count
            Start-Sleep -Seconds 7   # 무료 사용량(1분에 몇 번) 지키기
        }
        foreach ($m in $taken) {
            if ($m.key -gt [int64]$state.lastKey) { $state.lastKey = $m.key }
            if ($m.fav) { $favDone[[string]$m.key] = $true }
        }
        $state.favDone = @($favDone.Keys)
        Write-JsonFile $StateJson $state
    }
    if ($rows.Count -lt 300) { $state.sig = $sig }   # 다 읽었으면 다음엔 파일이 바뀔 때만 확인
    Write-JsonFile $StateJson $state
    Write-Log "쪽지 $($rows.Count)통 확인, 항목 $added 개 추가"
    Set-Status 'ok' ("쪽지 정리 끝 (새 항목 {0}개)" -f $added)
    return 'more'
}

# ── 계속 돌기 ──
Write-Log '엔진 시작'
while ($true) {
    if ($stopEvent.WaitOne(0)) { break }
    if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
    $result = 'error'
    try { $result = Invoke-Check }
    catch { Write-Log "오류: $($_.Exception.Message) $($_.InvocationInfo.PositionMessage)"; Set-Status 'error' "문제가 생겼어요: $($_.Exception.Message)" }
    if ($Once) { break }
    $wait = switch ($result) { 'more' { 1 } 'idle' { 15 } 'quota' { 1800 } 'stop' { 0 } default { 60 } }
    if ($result -eq 'stop') { break }
    for ($t = 0; $t -lt $wait; $t++) {
        if ($stopEvent.WaitOne(1000)) { break }
        if (Test-Path $ForceFile) { break }
    }
}
Write-Log '엔진 끝'
