# 설치: 프로그램을 내 컴퓨터에 복사하고, 컴퓨터를 켤 때마다 자동으로 실행되게 합니다.
$ErrorActionPreference = 'Stop'
try {
    $src  = Join-Path $PSScriptRoot 'MainMonitor.ps1'
    $dir  = Join-Path $env:LOCALAPPDATA 'MainMonitor'
    $dest = Join-Path $dir 'MainMonitor.ps1'
    if (-not (Test-Path $src)) { throw "MainMonitor.ps1 파일이 같은 폴더에 없어요. 압축을 먼저 풀어 주세요." }

    # 이미 돌고 있던 것이 있으면 끄고 새로 설치
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
        Where-Object { $_.CommandLine -like '*MainMonitor.ps1*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item $src $dest -Force

    $ps   = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $argLine = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dest`""
    $startup = [Environment]::GetFolderPath('Startup')
    $sh = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'MainMonitor.lnk'))
    $sh.TargetPath = $ps
    $sh.Arguments  = $argLine
    $sh.WindowStyle = 7
    $sh.Description = '한글/엑셀을 항상 메인 모니터에서 열기'
    $sh.Save()

    Start-Process $ps -ArgumentList $argLine -WindowStyle Hidden

    Write-Host ''
    Write-Host '  설치가 끝났어요!' -ForegroundColor Green
    Write-Host '  이제 한글, 엑셀 등을 열면 메인 모니터에서 열려요.'
    Write-Host '  컴퓨터를 다시 켜도 자동으로 계속 작동해요.'
} catch {
    Write-Host ''
    Write-Host '  설치하다가 문제가 생겼어요:' -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)"
}
Write-Host ''
Read-Host '  엔터 키를 누르면 창이 닫혀요'
