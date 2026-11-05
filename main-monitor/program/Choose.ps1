# 열릴 위치 고르기 창: 프로그램마다 메인 모니터 / 서브 모니터 / 사용 안 함 을 고릅니다.
# 고른 결과는 %LOCALAPPDATA%\MainMonitor\programs.txt 에 "프로그램=main" 처럼 저장되고,
# 작동 중인 프로그램이 몇 초 안에 알아서 다시 읽어요.

$SettingsFile = Join-Path $env:LOCALAPPDATA 'MainMonitor\programs.txt'

$ProgramGroups = [ordered]@{
    '문서' = [ordered]@{
        '한글'          = @('Hwp', 'HwpViewer')
        '한셀'          = @('HCell')
        '한쇼'          = @('HShow')
        '엑셀'          = @('EXCEL')
        '워드'          = @('WINWORD')
        '파워포인트'    = @('POWERPNT')
        '아크로뱃(PDF)' = @('AcroRd32', 'Acrobat')
    }
    '웹 브라우저' = [ordered]@{
        '크롬'     = @('chrome')
        '엣지'     = @('msedge')
        '브레이브' = @('brave')
    }
}

$PlaceNames = @('메인 모니터', '서브 모니터', '사용 안 함')
$PlaceCodes = @('main', 'sub', '')

# 처음 설치할 때 "사용 안 함"으로 둘 프로그램
# (발표는 서브 모니터에 띄우는 경우가 많고, 브라우저는 원하는 분만 켜도록)
$DefaultOff = @('한쇼', '파워포인트', '크롬', '엣지', '브레이브')

# 저장된 설정 읽기: 프로그램 이름(소문자) -> 'main' / 'sub'
# (예전 버전은 이름만 적었는데, 그건 메인 모니터로 읽어요)
function Read-ProgramChoice {
    $map = @{}
    if (-not (Test-Path $SettingsFile)) { return $null }
    foreach ($line in Get-Content $SettingsFile -Encoding UTF8) {
        $line = $line.Trim()
        if (-not $line -or $line -eq 'none') { continue }
        $name, $place = $line -split '=', 2
        if (-not $place) { $place = 'main' }
        $map[$name.Trim().ToLower()] = $place.Trim().ToLower()
    }
    return $map
}

# "프로그램=main" 줄 목록을 돌려줌 (취소하면 $null)
function Show-ProgramPicker {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $saved = Read-ProgramChoice

    $form = New-Object System.Windows.Forms.Form
    $form.Text = '메인 모니터로 열기 - 열릴 위치 고르기'
    $form.Font = New-Object System.Drawing.Font('Malgun Gothic', 11)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false; $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.AutoScaleMode = 'Font'

    $label = New-Object System.Windows.Forms.Label
    $label.Text = "프로그램마다 처음 열릴 모니터를 골라 주세요.`n`n※ 한쇼와 파워포인트는 '사용 안 함'을 추천해요.`n   (발표는 서브 모니터에 띄우는 경우가 많아서요)"
    $label.Location = New-Object System.Drawing.Point(20, 15)
    $label.Size = New-Object System.Drawing.Size(380, 95)
    $form.Controls.Add($label)

    $combos = [ordered]@{}
    $y = 115
    foreach ($group in $ProgramGroups.Keys) {
        $head = New-Object System.Windows.Forms.Label
        $head.Text = "[ $group ]"
        $head.Font = New-Object System.Drawing.Font('Malgun Gothic', 11, [System.Drawing.FontStyle]::Bold)
        $head.Location = New-Object System.Drawing.Point(20, $y)
        $head.Size = New-Object System.Drawing.Size(300, 28)
        $form.Controls.Add($head)
        $y += 32
        foreach ($name in $ProgramGroups[$group].Keys) {
            $procs = $ProgramGroups[$group][$name]
            $lb = New-Object System.Windows.Forms.Label
            $lb.Text = $name
            $lb.Location = New-Object System.Drawing.Point(35, ($y + 4))
            $lb.Size = New-Object System.Drawing.Size(150, 28)
            $form.Controls.Add($lb)

            $cb = New-Object System.Windows.Forms.ComboBox
            $cb.DropDownStyle = 'DropDownList'
            [void]$cb.Items.AddRange($PlaceNames)
            $cb.Location = New-Object System.Drawing.Point(190, $y)
            $cb.Size = New-Object System.Drawing.Size(190, 30)
            # 처음 설치할 때는 기본값, 그다음부터는 지난번에 고른 대로
            if ($null -eq $saved) {
                $cb.SelectedIndex = if ($DefaultOff -contains $name) { 2 } else { 0 }
            } else {
                $place = $saved[$procs[0].ToLower()]
                $cb.SelectedIndex = if ($place -eq 'sub') { 1 } elseif ($place -eq 'main') { 0 } else { 2 }
            }
            $form.Controls.Add($cb)
            $combos[$name] = @{ Box = $cb; Procs = $procs }
            $y += 38
        }
        $y += 8
    }

    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = '확인'
    $ok.Location = New-Object System.Drawing.Point(90, ($y + 10))
    $ok.Size = New-Object System.Drawing.Size(100, 40)
    $ok.DialogResult = 'OK'
    $form.Controls.Add($ok); $form.AcceptButton = $ok

    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = '취소'
    $cancel.Location = New-Object System.Drawing.Point(220, ($y + 10))
    $cancel.Size = New-Object System.Drawing.Size(100, 40)
    $cancel.DialogResult = 'Cancel'
    $form.Controls.Add($cancel); $form.CancelButton = $cancel

    $form.ClientSize = New-Object System.Drawing.Size(410, ($y + 65))

    if ($form.ShowDialog() -ne 'OK') { return $null }

    $chosen = @()
    foreach ($name in $combos.Keys) {
        $code = $PlaceCodes[$combos[$name].Box.SelectedIndex]
        if ($code) { foreach ($p in $combos[$name].Procs) { $chosen += "$p=$code" } }
    }
    return ,$chosen
}

function Save-ProgramChoice($chosen) {
    New-Item -ItemType Directory -Force -Path (Split-Path $SettingsFile) | Out-Null
    # 아무것도 안 고르면 "none" 한 줄만 적어서 "처음 설치"와 구분
    if ($chosen.Count -eq 0) { $chosen = @('none') }
    Set-Content -Path $SettingsFile -Value $chosen -Encoding UTF8
}
