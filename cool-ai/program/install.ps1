# 설치하기: 프로그램을 내 컴퓨터에 복사하고, 컴퓨터를 켤 때 자동으로 시작되게 합니다.
try {
    foreach ($f in 'common.ps1', 'engine.ps1', 'window.ps1') {
        if (-not (Test-Path (Join-Path $PSScriptRoot $f))) { throw '같은 폴더에 필요한 파일이 없어요. 압축을 먼저 풀어 주세요.' }
    }
    if (-not (Test-Path (Join-Path $env:LOCALAPPDATA 'CoolMessenger\Memo'))) {
        Write-Host '  ⚠ 이 PC에서 쿨메신저 쪽지 저장 폴더를 찾지 못했어요. 쿨메신저에 한 번 로그인한 뒤 써 주세요.' -ForegroundColor Yellow
    }

    # 이미 켜져 있으면 끄기
    $stop = New-Object System.Threading.EventWaitHandle($false, 'ManualReset', 'Local\CoolAIStop')
    $stop.Set() | Out-Null
    Start-Sleep -Seconds 3
    $stop.Reset() | Out-Null

    $dir  = Join-Path $env:LOCALAPPDATA 'CoolAI'
    $prog = Join-Path $dir 'program'
    New-Item -ItemType Directory -Force -Path $prog | Out-Null
    foreach ($f in 'common.ps1', 'engine.ps1', 'window.ps1') {
        Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $prog $f) -Force
        Unblock-File (Join-Path $prog $f)
    }

    # 설정 파일 만들고 API 키·내 정보 받기
    . (Join-Path $prog 'common.ps1')
    $ErrorActionPreference = 'Continue'
    $s = Read-Settings
    $text = [IO.File]::ReadAllText($SettingsTxt, [Text.Encoding]::UTF8)
    if (-not $s['API키']) {
        Write-Host ''
        Write-Host '  제미나이 API 키가 필요해요. https://aistudio.google.com/apikey 에서 무료로 받을 수 있어요.'
        $k = Read-Host '  API 키를 붙여 넣고 엔터 (나중에 넣으려면 그냥 엔터)'
        if ($k.Trim()) { $text = $text -replace '(?m)^API키 =.*$', "API키 = $($k.Trim())" }
    }
    if (-not $s['내_정보']) {
        Write-Host ''
        $me = Read-Host '  나에 대한 정보를 짧게 적어 주세요 (예: 5학년 담임, 과학 전담 / 없으면 엔터)'
        if ($me.Trim()) { $text = $text -replace '(?m)^내_정보 =.*$', "내_정보 = $($me.Trim())" }
    }
    [IO.File]::WriteAllText($SettingsTxt, $text, (New-Object Text.UTF8Encoding($true)))

    # 바로가기: 컴퓨터 켤 때 자동 시작 + 바탕화면
    $ps   = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $opts = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $prog 'window.ps1')`""
    $shell = New-Object -ComObject WScript.Shell
    foreach ($lnk in (Join-Path ([Environment]::GetFolderPath('Startup')) '쿨메신저 비서.lnk'),
                     (Join-Path ([Environment]::GetFolderPath('Desktop')) '쿨메신저 비서.lnk')) {
        $sc = $shell.CreateShortcut($lnk)
        $sc.TargetPath  = $ps
        $sc.Arguments   = $opts
        $sc.WindowStyle = 7
        $sc.IconLocation = "$env:WINDIR\System32\shell32.dll,165"
        $sc.Description = '쿨메신저 쪽지를 AI가 할 일·적을 것·기억할 것으로 정리'
        $sc.Save()
    }

    Start-Process $ps -ArgumentList $opts -WindowStyle Hidden

    Write-Host ''
    Write-Host '  설치가 끝났어요!' -ForegroundColor Green
    Write-Host '  화면 오른쪽 아래에 "쿨메신저 비서" 창이 떠요.'
    Write-Host '  · F9 : 창을 맨 위로 올리기 / 다시 누르면 뒤로 보내기'
    Write-Host '  · 📌 : 맨 위 고정 켜기·끄기,  ◐ 막대 : 투명도'
    Write-Host '  · ⚙  : 설정 (API 키, 단축키 바꾸기)'
    Write-Host '  처음에는 최근 쪽지를 정리하느라 몇 분 걸려요.'
    Write-Host '  컴퓨터를 다시 켜도 자동으로 시작되고, 바탕화면 "쿨메신저 비서"로도 켤 수 있어요.'
} catch {
    Write-Host ''
    Write-Host '  설치하다가 문제가 생겼어요:' -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)"
}
Write-Host ''
Read-Host '  엔터 키를 누르면 이 창이 닫혀요'
