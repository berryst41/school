# 제거하기: 작동 중인 프로그램을 끄고, 자동 시작과 복사한 파일을 지웁니다.
try {
    $stop = New-Object System.Threading.EventWaitHandle($false, 'ManualReset', 'Local\MainMonitorOpenerStop')
    $stop.Set() | Out-Null
    Start-Sleep -Seconds 1
    $stop.Reset() | Out-Null

    # 예전 버전이 남긴 자동 시작 바로가기 정리
    $old = Join-Path ([Environment]::GetFolderPath('Startup')) 'MainMonitor.lnk'
    if (Test-Path $old) { Remove-Item $old -Force }
    $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) '메인 모니터로 열기.lnk'
    if (Test-Path $lnk) { Remove-Item $lnk -Force }
    $dir = Join-Path $env:LOCALAPPDATA 'MainMonitor'
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }

    Write-Host ''
    Write-Host '  제거가 끝났어요. 이제 예전처럼 작동해요.' -ForegroundColor Green
} catch {
    Write-Host "  제거하다가 문제가 생겼어요: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ''
Read-Host '  엔터 키를 누르면 이 창이 닫혀요'
