# 제거: 자동 실행을 끄고 복사한 파일을 지웁니다.
try {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
        Where-Object { $_.CommandLine -like '*MainMonitor.ps1*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'MainMonitor.lnk'
    if (Test-Path $lnk) { Remove-Item $lnk -Force }
    $dir = Join-Path $env:LOCALAPPDATA 'MainMonitor'
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
    Write-Host ''
    Write-Host '  제거가 끝났어요. 이제 예전처럼 작동해요.' -ForegroundColor Green
} catch {
    Write-Host "  제거하다가 문제가 생겼어요: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ''
Read-Host '  엔터 키를 누르면 창이 닫혀요'
