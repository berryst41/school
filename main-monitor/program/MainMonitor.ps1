# 메인 모니터로 열기
# 한글·엑셀·브라우저 등의 창이 새로 열리면, 프로그램마다 고른 모니터(메인 / 서브) 가운데로 옮겨 줍니다.
# 창이 처음 열릴 때 한 번만 옮기므로, 쓰는 도중에는 다른 모니터로 마음대로 옮겨도 됩니다.
# 엑셀과 한글은 기억해 둔 창 자리도 고쳐 두어서, 옮기는 게 보이지 않고 처음부터 고른 모니터에 열려요.
# 윈도우에 들어 있는 "UI 자동화" 기능만 사용합니다. 화면에 창 없이 뒤에서 작동해요.
# 끄려면 2_제거하기.bat 을 실행하세요.

# 프로그램마다 열릴 위치는 programs.txt 에 "프로그램=main" 또는 "프로그램=sub" 로 적혀 있어요.
# (3_프로그램고르기.bat 으로 고르면 이 파일이 바뀌고, 몇 초 안에 알아서 다시 읽어요)
# 파일이 없으면 아래 문서 프로그램 전부를 메인 모니터로 열어요.
$DefaultTargets = @('Hwp', 'HwpViewer', 'HCell', 'HShow', 'EXCEL', 'WINWORD', 'POWERPNT', 'AcroRd32', 'Acrobat')
$SettingsFile = Join-Path $env:LOCALAPPDATA 'MainMonitor\programs.txt'

# 브라우저는 "처음 켤 때" 창만 옮겨요. 탭을 끌어내 새 창을 만들 때마다 옮기면 불편하니까요.
$Browsers = @('chrome', 'msedge', 'brave')

# 같은 프로그램이 두 번 켜지지 않게
$first = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\MainMonitorOpener2', [ref]$first)
if (-not $first) { exit }
# 제거하기를 누르면 이 신호를 받아 스스로 꺼짐
$stopSignal = New-Object System.Threading.EventWaitHandle($false, 'ManualReset', 'Local\MainMonitorOpenerStop')
$stopSignal.Reset() | Out-Null

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$UIA     = [System.Windows.Automation.AutomationElement]
$isWin   = New-Object System.Windows.Automation.PropertyCondition($UIA::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window)
$Scope   = [System.Windows.Automation.TreeScope]::Children
$WinPat  = [System.Windows.Automation.WindowPattern]::Pattern
$MovePat = [System.Windows.Automation.TransformPattern]::Pattern
$VState  = [System.Windows.Automation.WindowVisualState]
$Screens = [System.Windows.Forms.Screen]

# 프로그램 이름(소문자) -> 'main' / 'sub'
$want = @{}
$settingsStamp = $null
function Update-Targets {
    $stamp = if (Test-Path $SettingsFile) { (Get-Item $SettingsFile).LastWriteTimeUtc } else { 'none' }
    if ($stamp -eq $script:settingsStamp) { return }
    $script:settingsStamp = $stamp
    $list = if (Test-Path $SettingsFile) { Get-Content $SettingsFile -Encoding UTF8 } else { $DefaultTargets }
    $script:want = @{}
    foreach ($line in $list) {
        $line = "$line".Trim()
        if (-not $line -or $line -eq 'none') { continue }
        $name, $place = $line -split '=', 2
        if (-not $place) { $place = 'main' }   # 예전 버전 설정은 이름만 있어요 -> 메인 모니터
        $script:want[$name.Trim().ToLower()] = $place.Trim().ToLower()
    }
}
Update-Targets

# 'main' 은 주 모니터, 'sub' 는 주 모니터가 아닌 첫 번째 모니터 (없으면 $null)
function Get-TargetScreen($place) {
    if ($place -eq 'sub') { return $Screens::AllScreens | Where-Object { -not $_.Primary } | Select-Object -First 1 }
    return $Screens::PrimaryScreen
}

$nameOf = @{}
function Get-ProcName([int]$procId) {
    if (-not $nameOf.ContainsKey($procId)) {
        $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $nameOf[$procId] = if ($p) { $p.ProcessName.ToLower() } else { '' }
    }
    $nameOf[$procId]
}

function Get-Windows {
    $list = @()
    try {
        foreach ($el in $UIA::RootElement.FindAll($Scope, $isWin)) {
            try {
                if ($el.Current.NativeWindowHandle -eq 0) { continue }
                $id = $el.Current.ProcessId
                $list += [pscustomobject]@{ Id = $el.Current.NativeWindowHandle; Name = (Get-ProcName $id); El = $el }
            } catch { }
        }
    } catch { }
    $list
}

function Move-ToScreen($el, $screen) {
    $work = $screen.WorkingArea
    $r = $el.Current.BoundingRectangle
    if ($r.IsEmpty) { return }
    $cx = [int]($r.X + $r.Width / 2); $cy = [int]($r.Y + $r.Height / 2)
    if ($screen.Bounds.Contains($cx, $cy)) { return }   # 이미 고른 모니터에 있음

    $win = $null
    try { $win = $el.GetCurrentPattern($WinPat) } catch { }
    $wasMax = $false
    if ($win) {
        $state = $win.Current.WindowVisualState
        if ($state -eq $VState::Minimized) { return }
        if ($state -eq $VState::Maximized) {
            $wasMax = $true
            $win.SetWindowVisualState($VState::Normal)
            Start-Sleep -Milliseconds 100
            $r = $el.Current.BoundingRectangle
        }
    }

    $move = $el.GetCurrentPattern($MovePat)
    $w = [Math]::Min($r.Width, $work.Width); $h = [Math]::Min($r.Height, $work.Height)
    if (($w -lt $r.Width -or $h -lt $r.Height) -and $move.Current.CanResize) { $move.Resize($w, $h) }
    if ($move.Current.CanMove) {
        $move.Move($work.X + ($work.Width - $w) / 2, $work.Y + ($work.Height - $h) / 2)
    }
    if ($wasMax) { $win.SetWindowVisualState($VState::Maximized) }
}

# 엑셀은 닫을 때 창 자리를 레지스트리 Options\Pos ("왼쪽,위,너비,높이")에 적어 두고
# 다음에 열 때 그 자리에 띄워요. 엑셀이 꺼져 있을 때 그 자리가 고른 모니터 밖이면
# 고른 모니터 가운데로 고쳐 써서, 다음에 열 때 처음부터 그 모니터에 뜨게 해요.
function Repair-ExcelPosition {
    if (-not $want.ContainsKey('excel')) { return }
    if (Get-Process -Name EXCEL -ErrorAction SilentlyContinue) { return }   # 켜져 있을 때는 건드리지 않음
    $screen = Get-TargetScreen $want['excel']
    if (-not $screen) { return }   # 서브 모니터가 연결되어 있지 않음
    $work = $screen.WorkingArea
    foreach ($key in Get-ChildItem 'HKCU:\Software\Microsoft\Office' -ErrorAction SilentlyContinue) {
        $opt = "$($key.PSPath)\Excel\Options"
        $pos = (Get-ItemProperty -Path $opt -Name Pos -ErrorAction SilentlyContinue).Pos
        if (-not $pos) { continue }
        $n = @($pos -split ',' | ForEach-Object { $_.Trim() -as [int] })
        if ($n.Count -ne 4 -or $null -in $n) { continue }
        $x, $y, $w, $h = $n
        if ($screen.Bounds.Contains([int]($x + $w / 2), [int]($y + $h / 2))) { continue }   # 이미 고른 모니터
        $w = [Math]::Min($w, $work.Width); $h = [Math]::Min($h, $work.Height)
        $x = $work.X + [int](($work.Width - $w) / 2); $y = $work.Y + [int](($work.Height - $h) / 2)
        Set-ItemProperty -Path $opt -Name Pos -Value "$x,$y,$w,$h" -ErrorAction SilentlyContinue
    }
}

# 한글은 문서마다 마지막 창 자리를 "최근 문서 목록" 파일
# %APPDATA%\HNC\User\Common\<버전>\recentInfo.xml 에 <PositionInfo ... Width Height X Y /> 로 적어 두고,
# 그 문서를 다시 열면 그 자리에 띄워요. (선생님 컴퓨터에서 메인/서브에서 닫아 비교해 확인했어요)
# 한글이 꺼져 있을 때, 고른 모니터 밖에 있는 자리를 모두 고른 모니터 가운데로 고쳐 써요.
# 문서 이름 등 다른 내용은 건드리지 않고 X, Y (필요하면 Width, Height) 숫자만 바꿔요.
$hwpStamp   = @{}     # 파일 -> 마지막으로 확인한 시각 (바뀌었을 때만 다시 읽음)
$hwpPending = $false  # 한글 창이 닫혔음 -> 한글이 완전히 꺼지면 바로 고침
$hwpIds     = @{}     # 열려 있는 한글 창

function Repair-HwpPosition {
    if (-not $want.ContainsKey('hwp')) { return }
    if (Get-Process -Name Hwp -ErrorAction SilentlyContinue) { return }   # 켜져 있을 때는 건드리지 않음
    $screen = Get-TargetScreen $want['hwp']
    if (-not $screen) { return }   # 서브 모니터가 연결되어 있지 않음
    $work = $screen.WorkingArea
    $root = Join-Path $env:APPDATA 'HNC\User\Common'
    foreach ($file in Get-ChildItem $root -Recurse -Filter 'recentInfo.xml' -ErrorAction SilentlyContinue) {
        $key = "$($file.FullName)|$($screen.DeviceName)"
        if ($hwpStamp[$key] -eq $file.LastWriteTimeUtc) { continue }
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        # 원래 파일과 같은 글자 방식으로 다시 쓰기 위해 앞부분(BOM)을 확인
        $bom = 0
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $enc = New-Object System.Text.UTF8Encoding($false); $bom = 3 }
        elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { $enc = New-Object System.Text.UnicodeEncoding($false, $false); $bom = 2 }
        elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0x3C -and $bytes[1] -eq 0x00) { $enc = New-Object System.Text.UnicodeEncoding($false, $false) }
        else { $enc = New-Object System.Text.UTF8Encoding($false) }
        $text = $enc.GetString($bytes, $bom, $bytes.Length - $bom)

        $sb = New-Object System.Text.StringBuilder
        $last = 0; $changed = $false
        foreach ($m in [regex]::Matches($text, '<PositionInfo\b[^>]*>')) {
            $tag = $m.Value
            $v = @{}
            foreach ($n in 'X', 'Y', 'Width', 'Height') {
                $mm = [regex]::Match($tag, '\b' + $n + '="(-?\d+)"')
                if ($mm.Success) { $v[$n] = [int]$mm.Groups[1].Value }
            }
            if ($v.Count -ne 4) { continue }
            if ($screen.Bounds.Contains([int]($v.X + $v.Width / 2), [int]($v.Y + $v.Height / 2))) { continue }   # 이미 고른 모니터
            $w = [Math]::Min($v.Width, $work.Width); $h = [Math]::Min($v.Height, $work.Height)
            $x = $work.X + [int](($work.Width - $w) / 2); $y = $work.Y + [int](($work.Height - $h) / 2)
            $newTag = $tag -replace '\bX="-?\d+"', "X=`"$x`"" -replace '\bY="-?\d+"', "Y=`"$y`"" -replace '\bWidth="-?\d+"', "Width=`"$w`"" -replace '\bHeight="-?\d+"', "Height=`"$h`""
            [void]$sb.Append($text, $last, $m.Index - $last).Append($newTag)
            $last = $m.Index + $m.Length; $changed = $true
        }
        if ($changed) {
            [void]$sb.Append($text, $last, $text.Length - $last)
            $body = $enc.GetBytes($sb.ToString())
            $outBytes = New-Object byte[] ($bom + $body.Length)
            if ($bom) { [Array]::Copy($bytes, 0, $outBytes, 0, $bom) }
            [Array]::Copy($body, 0, $outBytes, $bom, $body.Length)
            [System.IO.File]::WriteAllBytes($file.FullName, $outBytes)
        }
        $hwpStamp[$key] = (Get-Item $file.FullName).LastWriteTimeUtc
    }
}

$seen = @{}      # 이미 확인한 창
$waiting = @{}   # 막 나타난 창 (프로그램이 스스로 자리 잡을 시간을 조금 줌)

# 켜기 전부터 열려 있던 창은 건드리지 않음
foreach ($w in Get-Windows) { $seen[$w.Id] = $true }

try { Repair-ExcelPosition } catch { }
try { Repair-HwpPosition } catch { }
$tick = 0
while (-not $stopSignal.WaitOne(400)) {
    if ((++$tick % 10) -eq 0) {   # 4초마다
        Update-Targets                            # 고른 설정 다시 읽기
        try { Repair-ExcelPosition } catch { }    # 엑셀이 기억한 창 자리 고치기
        try { Repair-HwpPosition } catch { }      # 한글이 기억한 창 자리 고치기
    }
    $windows = @(Get-Windows)
    $alive = @{}
    foreach ($w in $windows) { $alive[$w.Id] = $true }
    # 한글 창이 하나라도 닫히면, 한글이 완전히 꺼지는 즉시 기억한 창 자리를 고쳐 씀
    foreach ($k in @($seen.Keys)) { if (-not $alive.ContainsKey($k) -and $hwpIds.ContainsKey($k)) { $hwpPending = $true; $hwpIds.Remove($k) } }
    foreach ($w in $windows) { if ($w.Name -eq 'hwp') { $hwpIds[$w.Id] = $true } }
    if ($hwpPending -and -not (Get-Process -Name Hwp -ErrorAction SilentlyContinue)) {
        try { Repair-HwpPosition } catch { }
        $hwpPending = $false
    }
    foreach ($w in $windows) {
        if ($seen.ContainsKey($w.Id)) { continue }
        if (-not $want.ContainsKey($w.Name)) { $seen[$w.Id] = $true; continue }
        # 브라우저는 이미 다른 창이 떠 있으면 (탭을 끌어낸 창 등) 건드리지 않음
        if ($Browsers -contains $w.Name -and
            @($windows | Where-Object { $_.Name -eq $w.Name -and $_.Id -ne $w.Id -and $seen.ContainsKey($_.Id) }).Count -gt 0) {
            $seen[$w.Id] = $true; continue
        }
        if (-not $waiting.ContainsKey($w.Id)) { $waiting[$w.Id] = $true; continue }
        $screen = Get-TargetScreen $want[$w.Name]
        if ($screen) { try { Move-ToScreen $w.El $screen } catch { } }
        $waiting.Remove($w.Id); $seen[$w.Id] = $true
    }
    foreach ($k in @($seen.Keys))    { if (-not $alive.ContainsKey($k)) { $seen.Remove($k) } }
    foreach ($k in @($waiting.Keys)) { if (-not $alive.ContainsKey($k)) { $waiting.Remove($k) } }
    if ($nameOf.Count -gt 300) { $nameOf.Clear() }
}
