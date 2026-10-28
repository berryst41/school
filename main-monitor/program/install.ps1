# 설치하기: 프로그램을 내 컴퓨터에 복사하고, 컴퓨터를 켤 때 자동으로 시작되게 합니다.
try {
    $src  = Join-Path $PSScriptRoot 'MainMonitor.ps1'
    if (-not (Test-Path $src) -or -not (Test-Path (Join-Path $PSScriptRoot 'Choose.ps1'))) { throw '같은 폴더에 필요한 파일이 없어요. 압축을 먼저 풀어 주세요.' }
    $dir  = Join-Path $env:LOCALAPPDATA 'MainMonitor'
    $dest = Join-Path $dir 'MainMonitor.ps1'

    # 어떤 프로그램에 적용할지 고르기
    . (Join-Path $PSScriptRoot 'Choose.ps1')
    Write-Host ''
    Write-Host '  화면에 뜬 창에서 메인 모니터로 열 프로그램을 골라 주세요.'
    $chosen = Show-ProgramPicker
    if ($null -eq $chosen) { throw '설치를 취소했어요.' }

    # 이미 작동 중인 것이 있으면 끄라는 신호를 보내고 새로 설치
    $stop = New-Object System.Threading.EventWaitHandle($false, 'ManualReset', 'Local\MainMonitorOpenerStop')
    $stop.Set() | Out-Null
    Start-Sleep -Seconds 1
    $stop.Reset() | Out-Null

    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item $src $dest -Force
    Unblock-File $dest
    Save-ProgramChoice $chosen

    $ps   = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $opts = "-NoProfile -ExecutionPolicy RemoteSigned -WindowStyle Hidden -File `"$dest`""
    # 예전 버전이 남긴 자동 시작 바로가기 정리
    $old = Join-Path ([Environment]::GetFolderPath('Startup')) 'MainMonitor.lnk'
    if (Test-Path $old) { Remove-Item $old -Force }
    $lnk  = Join-Path ([Environment]::GetFolderPath('Startup')) '메인 모니터로 열기.lnk'
    $sc = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    $sc.TargetPath  = $ps
    $sc.Arguments   = $opts
    $sc.WindowStyle = 7
    $sc.Description = '한글·엑셀을 항상 메인 모니터에서 열기'
    $sc.Save()

    Start-Process $ps -ArgumentList $opts -WindowStyle Hidden

    Write-Host ''
    Write-Host '  설치가 끝났어요!' -ForegroundColor Green
    Write-Host '  이제 고른 프로그램을 열면 메인 모니터에서 열려요.'
    Write-Host '  나중에 바꾸고 싶으면 3_프로그램고르기.bat 을 더블클릭하세요.'
    Write-Host '  화면에는 보이지 않고 뒤에서 조용히 작동해요.'
    Write-Host '  컴퓨터를 다시 켜도 자동으로 시작돼요.'
} catch {
    Write-Host ''
    Write-Host '  설치하다가 문제가 생겼어요:' -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)"
}
Write-Host ''
Read-Host '  엔터 키를 누르면 이 창이 닫혀요'
