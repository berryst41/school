# 프로그램 고르기: 메인 모니터에서 열리게 할 프로그램을 다시 고릅니다.
try {
    . (Join-Path $PSScriptRoot 'Choose.ps1')
    if (-not (Test-Path (Join-Path $env:LOCALAPPDATA 'MainMonitor\MainMonitor.ps1'))) {
        throw '아직 설치되지 않았어요. 1_설치하기.bat 을 먼저 더블클릭해 주세요.'
    }
    $chosen = Show-ProgramPicker
    if ($null -eq $chosen) {
        Write-Host ''
        Write-Host '  바꾸지 않고 그대로 두었어요.'
    } else {
        Save-ProgramChoice $chosen
        Write-Host ''
        Write-Host '  저장했어요! 몇 초 안에 바로 적용돼요.' -ForegroundColor Green
    }
} catch {
    Write-Host ''
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ''
Read-Host '  엔터 키를 누르면 이 창이 닫혀요'
