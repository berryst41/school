# 쿨메신저 비서 - 창과 정리 엔진이 함께 쓰는 기능
$ErrorActionPreference = 'Stop'
$Script:AppDir      = Join-Path $env:LOCALAPPDATA 'CoolAI'
$Script:SettingsTxt = Join-Path $AppDir '설정.txt'
$Script:ItemsJson   = Join-Path $AppDir 'items.json'     # 정리된 항목 (엔진이 씀)
$Script:MsgsJson    = Join-Path $AppDir 'msgs.json'      # 원래 쪽지 (엔진이 씀)
$Script:StatusJson  = Join-Path $AppDir 'status.json'    # 엔진 상태 (엔진이 씀)
$Script:StateJson   = Join-Path $AppDir 'state.json'     # 어디까지 읽었는지 (엔진이 씀)
$Script:DoneJson    = Join-Path $AppDir 'done.json'      # 완료 표시 (창이 씀)
$Script:UiJson      = Join-Path $AppDir 'ui.json'        # 창 위치·투명도 (창이 씀)
$Script:ForceFile   = Join-Path $AppDir 'force.txt'      # 지금 확인 신호
$Script:LogTxt      = Join-Path $AppDir 'log.txt'
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

$Script:DefaultSettings = @'
# ───────── 쿨메신저 비서 설정 ─────────
# 고친 뒤 저장(Ctrl+S)하면 1분 안에 반영돼요. (단축키만은 비서 창을 다시 켜야 바뀌어요)
# '#' 으로 시작하는 줄은 설명이라 무시돼요.

# 제미나이 API 키: https://aistudio.google.com/apikey 에서 무료로 받아서 = 뒤에 붙여 넣어요.
API키 =

# 쓸 제미나이 모델 (gemini-flash-latest = 항상 최신 Flash)
모델 = gemini-flash-latest

# 나에 대한 정보. 적어 두면 다른 학년·다른 업무 쪽지는 빼고 정리해요. (예: 5학년 담임, 과학 전담, 정보 업무)
내_정보 =

# 창을 맨 위로 올리거나 뒤로 보내는 단축키 (예: F9, F8, Ctrl+F9, Alt+Q)
단축키 = F9

# 처음 켤 때 며칠 전 쪽지부터 살펴볼지 (기한이 지난 건 빼고 정리해요)
처음_살펴볼_날짜 = 45

# 정리하지 않을 보낸 사람 (쉼표로 여러 명)
제외할_보낸사람 = 쿨서비스

# 새 할 일이 생기면 창을 잠깐 맨 앞으로 보여 주기 (예 / 아니오)
새_항목_알림 = 예
'@

function Read-Settings {
    if (-not (Test-Path $SettingsTxt)) {
        [IO.File]::WriteAllText($SettingsTxt, $DefaultSettings, (New-Object Text.UTF8Encoding($true)))
    }
    $s = @{ 'API키' = ''; '모델' = 'gemini-flash-latest'; '내_정보' = ''; '단축키' = 'F9'
             '처음_살펴볼_날짜' = '45'; '제외할_보낸사람' = '쿨서비스'; '새_항목_알림' = '예' }
    foreach ($line in [IO.File]::ReadAllLines($SettingsTxt, [Text.Encoding]::UTF8)) {
        $t = $line.Trim()
        if ($t -eq '' -or $t.StartsWith('#')) { continue }
        $i = $t.IndexOf('=')
        if ($i -lt 1) { continue }
        $s[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim()
    }
    return $s
}

function Read-JsonFile($path, $default) {
    for ($try = 0; $try -lt 3; $try++) {
        try {
            if (-not (Test-Path $path)) { return $default }
            $txt = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
            if ($txt.Trim() -eq '') { return $default }
            return (ConvertFrom-Json $txt)
        } catch { Start-Sleep -Milliseconds 200 }
    }
    return $default
}

function Write-JsonFile($path, $obj) {
    $json = ConvertTo-Json -InputObject $obj -Depth 8 -Compress
    $tmp = "$path.tmp"
    [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding($false)))
    for ($try = 0; $try -lt 5; $try++) {
        try {
            if (Test-Path $path) { [IO.File]::Replace($tmp, $path, [NullString]::Value) } else { [IO.File]::Move($tmp, $path) }
            return
        } catch { Start-Sleep -Milliseconds 200 }
    }
}

function Write-Log($msg) {
    try {
        if ((Test-Path $LogTxt) -and (Get-Item $LogTxt).Length -gt 500KB) { Remove-Item $LogTxt -Force }
        [IO.File]::AppendAllText($LogTxt, ("[{0:yyyy-MM-dd HH:mm:ss}] {1}`r`n" -f (Get-Date), $msg), [Text.Encoding]::UTF8)
    } catch {}
}
