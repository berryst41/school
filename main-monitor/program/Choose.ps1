# 프로그램 고르기 창: 메인 모니터에서 열리게 할 프로그램을 체크 상자로 고릅니다.
# 고른 결과는 %LOCALAPPDATA%\MainMonitor\programs.txt 에 저장되고,
# 작동 중인 프로그램이 몇 초 안에 알아서 다시 읽어요.

$SettingsFile = Join-Path $env:LOCALAPPDATA 'MainMonitor\programs.txt'

$ProgramChoices = [ordered]@{
    '한글'          = @('Hwp', 'HwpViewer')
    '한셀'          = @('HCell')
    '한쇼'          = @('HShow')
    '엑셀'          = @('EXCEL')
    '워드'          = @('WINWORD')
    '파워포인트'    = @('POWERPNT')
    '아크로뱃(PDF)' = @('AcroRd32', 'Acrobat')
}

# 고른 프로그램 이름 목록을 돌려줌 (취소하면 $null)
function Show-ProgramPicker {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing

    $saved = @()
    if (Test-Path $SettingsFile) { $saved = Get-Content $SettingsFile -Encoding UTF8 | ForEach-Object { $_.Trim() } }

    $form = New-Object System.Windows.Forms.Form
    $form.Text = '메인 모니터로 열기 - 프로그램 고르기'
    $form.Font = New-Object System.Drawing.Font('Malgun Gothic', 11)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false; $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.AutoScaleMode = 'Font'
    $form.ClientSize = New-Object System.Drawing.Size(360, 430)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = "메인 모니터에서 열리게 할 프로그램에`n체크해 주세요."
    $label.Location = New-Object System.Drawing.Point(20, 15)
    $label.Size = New-Object System.Drawing.Size(320, 50)
    $form.Controls.Add($label)

    $boxes = [ordered]@{}
    $y = 70
    foreach ($name in $ProgramChoices.Keys) {
        $cb = New-Object System.Windows.Forms.CheckBox
        $cb.Text = $name
        $cb.Location = New-Object System.Drawing.Point(30, $y)
        $cb.Size = New-Object System.Drawing.Size(300, 32)
        # 처음 설치할 때는 모두 체크, 그다음부터는 지난번에 고른 대로
        $cb.Checked = ($saved.Count -eq 0) -or (@($ProgramChoices[$name] | Where-Object { $saved -contains $_ }).Count -gt 0)
        $form.Controls.Add($cb)
        $boxes[$name] = $cb
        $y += 36
    }

    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = '확인'
    $ok.Location = New-Object System.Drawing.Point(70, ($y + 15))
    $ok.Size = New-Object System.Drawing.Size(100, 40)
    $ok.DialogResult = 'OK'
    $form.Controls.Add($ok); $form.AcceptButton = $ok

    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = '취소'
    $cancel.Location = New-Object System.Drawing.Point(190, ($y + 15))
    $cancel.Size = New-Object System.Drawing.Size(100, 40)
    $cancel.DialogResult = 'Cancel'
    $form.Controls.Add($cancel); $form.CancelButton = $cancel

    if ($form.ShowDialog() -ne 'OK') { return $null }

    $chosen = @()
    foreach ($name in $boxes.Keys) { if ($boxes[$name].Checked) { $chosen += $ProgramChoices[$name] } }
    return ,$chosen
}

function Save-ProgramChoice($chosen) {
    New-Item -ItemType Directory -Force -Path (Split-Path $SettingsFile) | Out-Null
    # 아무것도 안 고르면 "none" 한 줄만 적어서 "모두"와 구분
    if ($chosen.Count -eq 0) { $chosen = @('none') }
    Set-Content -Path $SettingsFile -Value $chosen -Encoding UTF8
}
