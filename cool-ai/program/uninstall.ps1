# 제거하기: 비서를 끄고, 자동 시작·바로가기·저장한 파일을 지웁니다. (쿨메신저 쪽지는 건드리지 않아요)
try {
    $stop = New-Object System.Threading.EventWaitHandle($false, 'ManualReset', 'Local\CoolAIStop')
    $stop.Set() | Out-Null
    Start-Sleep -Seconds 3
    $stop.Reset() | Out-Null

    foreach ($lnk in (Join-Path ([Environment]::GetFolderPath('Startup')) '쿨메신저 비서.lnk'),
                     (Join-Path ([Environment]::GetFolderPath('Desktop')) '쿨메신저 비서.lnk')) {
        if (Test-Path $lnk) { Remove-Item $lnk -Force }
    }
    $dir = Join-Path $env:LOCALAPPDATA 'CoolAI'
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }

    Write-Host ''
    Write-Host '  제거가 끝났어요. (정리한 목록과 API 키도 지워졌어요)' -ForegroundColor Green
} catch {
    Write-Host "  제거하다가 문제가 생겼어요: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ''
Read-Host '  엔터 키를 누르면 이 창이 닫혀요'
