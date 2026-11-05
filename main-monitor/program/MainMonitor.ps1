# 메인 모니터로 열기
# 한글·엑셀·브라우저 등의 창이 새로 열리면, 프로그램마다 고른 모니터(메인 / 서브) 가운데로 옮겨 줍니다.
# 창이 처음 열릴 때 한 번만 옮기므로, 쓰는 도중에는 다른 모니터로 마음대로 옮겨도 됩니다.
# 엑셀·워드·파워포인트·한글·한셀·한쇼·크롬·엣지·브레이브는 기억해 둔 창 자리도 고쳐 두어서,
# 옮기는 게 보이지 않고 처음부터 고른 모니터에 열려요.
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

# 고른 모니터의 작업 영역 가운데에 놓일 왼쪽 위 자리와 크기
function Get-CenterRect($w, $h, $work) {
    if ($w -le 0) { $w = [int]($work.Width * 0.7) }  elseif ($w -gt $work.Width)  { $w = $work.Width }
    if ($h -le 0) { $h = [int]($work.Height * 0.7) } elseif ($h -gt $work.Height) { $h = $work.Height }
    @{ X = $work.X + [int](($work.Width - $w) / 2); Y = $work.Y + [int](($work.Height - $h) / 2); W = [int]$w; H = [int]$h }
}
function Test-OnScreen($screen, $x, $y, $w, $h) { $screen.Bounds.Contains([int]($x + $w / 2), [int]($y + $h / 2)) }

# 파워포인트는 닫을 때 창 자리를 레지스트리 PowerPoint\Options 의 Left, Top, Right, Bottom 에 적어 둬요.
function Repair-PowerPointPosition {
    if (-not $want.ContainsKey('powerpnt')) { return }
    if (Get-Process -Name POWERPNT -ErrorAction SilentlyContinue) { return }
    $screen = Get-TargetScreen $want['powerpnt']; if (-not $screen) { return }
    $office = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Office')
    if (-not $office) { return }
    foreach ($ver in $office.GetSubKeyNames()) {
        $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Microsoft\Office\$ver\PowerPoint\Options", $true)
        if (-not $k) { continue }
        try {
            $v = @{}
            foreach ($n in 'Left', 'Top', 'Right', 'Bottom') { $raw = $k.GetValue($n); if ($null -ne $raw -and "$raw" -match '^-?\d+$') { $v[$n] = [int]"$raw" } }
            if ($v.Count -ne 4) { continue }
            $w = $v.Right - $v.Left; $h = $v.Bottom - $v.Top
            if (Test-OnScreen $screen $v.Left $v.Top $w $h) { continue }
            $r = Get-CenterRect $w $h $screen.WorkingArea
            $new = @{ Left = $r.X; Top = $r.Y; Right = $r.X + $r.W; Bottom = $r.Y + $r.H }
            foreach ($n in 'Left', 'Top', 'Right', 'Bottom') {
                $kind = $k.GetValueKind($n)   # 원래 값의 종류(글자/숫자)를 그대로 지킴
                if ($kind -eq [Microsoft.Win32.RegistryValueKind]::String) { $k.SetValue($n, [string]$new[$n], $kind) } else { $k.SetValue($n, [int]$new[$n], $kind) }
            }
        } finally { $k.Close() }
    }
}

# 워드는 닫을 때 창 자리를 레지스트리 Word\Options 의 AppWindowPos (숫자 4개: 왼쪽, 위, 너비, 높이)에 적어 둬요.
function Repair-WordPosition {
    if (-not $want.ContainsKey('winword')) { return }
    if (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) { return }
    $screen = Get-TargetScreen $want['winword']; if (-not $screen) { return }
    $office = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Office')
    if (-not $office) { return }
    foreach ($ver in $office.GetSubKeyNames()) {
        $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Microsoft\Office\$ver\Word\Options", $true)
        if (-not $k) { continue }
        try {
            $b = $k.GetValue('AppWindowPos')
            if (-not ($b -is [byte[]]) -or $b.Length -lt 16) { continue }
            $x = [BitConverter]::ToInt32($b, 0); $y = [BitConverter]::ToInt32($b, 4)
            $w = [BitConverter]::ToInt32($b, 8); $h = [BitConverter]::ToInt32($b, 12)
            if (Test-OnScreen $screen $x $y $w $h) { continue }
            $r = Get-CenterRect $w $h $screen.WorkingArea
            $nb = [byte[]]$b.Clone()
            [Array]::Copy([BitConverter]::GetBytes([int]$r.X), 0, $nb, 0, 4)
            [Array]::Copy([BitConverter]::GetBytes([int]$r.Y), 0, $nb, 4, 4)
            [Array]::Copy([BitConverter]::GetBytes([int]$r.W), 0, $nb, 8, 4)
            [Array]::Copy([BitConverter]::GetBytes([int]$r.H), 0, $nb, 12, 4)
            $k.SetValue('AppWindowPos', $nb, [Microsoft.Win32.RegistryValueKind]::Binary)
        } finally { $k.Close() }
    }
}

# 크롬·엣지·브레이브는 닫을 때 창 자리를 사용자 폴더마다 Preferences 파일의
# "window_placement": { left, top, right, bottom, work_area_... } 에 적어 둬요.
# 브라우저가 완전히 꺼져 있을 때만 고쳐요. (뒤에서 계속 켜져 있으면 고칠 수 없어서, 열린 뒤에 옮겨요)
$BrowserData = @{
    chrome = 'Google\Chrome\User Data'
    msedge = 'Microsoft\Edge\User Data'
    brave  = 'BraveSoftware\Brave-Browser\User Data'
}
$prefStamp = @{}
function Repair-BrowserPosition {
    foreach ($name in $BrowserData.Keys) {
        if (-not $want.ContainsKey($name)) { continue }
        if (Get-Process -Name $name -ErrorAction SilentlyContinue) { continue }
        $screen = Get-TargetScreen $want[$name]; if (-not $screen) { continue }
        $work = $screen.WorkingArea
        $dir = Join-Path $env:LOCALAPPDATA $BrowserData[$name]
        if (-not (Test-Path $dir)) { continue }
        foreach ($prof in Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue) {
            $file = Join-Path $prof.FullName 'Preferences'
            if (-not (Test-Path $file)) { continue }
            $time = (Get-Item $file).LastWriteTimeUtc
            $key = "$file|$($screen.DeviceName)"
            if ($prefStamp[$key] -eq $time) { continue }
            $text = [IO.File]::ReadAllText($file)
            $sb = New-Object System.Text.StringBuilder
            $last = 0; $changed = $false
            foreach ($m in [regex]::Matches($text, '"window_placement"\s*:\s*\{[^{}]*\}')) {
                $tag = $m.Value; $v = @{}
                foreach ($n in 'left', 'top', 'right', 'bottom') {
                    $mm = [regex]::Match($tag, '"' + $n + '"\s*:\s*(-?\d+)')
                    if ($mm.Success) { $v[$n] = [int]$mm.Groups[1].Value }
                }
                if ($v.Count -ne 4) { continue }
                $w = $v.right - $v.left; $h = $v.bottom - $v.top
                if (Test-OnScreen $screen $v.left $v.top $w $h) { continue }   # 이미 고른 모니터
                $r = Get-CenterRect $w $h $work
                $set = [ordered]@{ left = $r.X; top = $r.Y; right = $r.X + $r.W; bottom = $r.Y + $r.H
                                   work_area_left = $work.Left; work_area_top = $work.Top; work_area_right = $work.Right; work_area_bottom = $work.Bottom }
                foreach ($n in $set.Keys) { $tag = [regex]::Replace($tag, '"' + $n + '"\s*:\s*-?\d+', '"' + $n + '":' + $set[$n]) }
                [void]$sb.Append($text, $last, $m.Index - $last).Append($tag)
                $last = $m.Index + $m.Length; $changed = $true
            }
            if ($changed) {
                [void]$sb.Append($text, $last, $text.Length - $last)
                [IO.File]::WriteAllText($file, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
            }
            $prefStamp[$key] = (Get-Item $file).LastWriteTimeUtc
        }
    }
}

# 한컴 프로그램(한글·한셀·한쇼)은 문서마다 마지막 창 자리를 "최근 문서 목록" 파일
# %APPDATA%\HNC\User\Common\<버전>\recentInfo.xml 에 <PositionInfo ... Width Height X Y /> 로 적어 두고,
# 그 문서를 다시 열면 그 자리에 띄워요. (선생님 컴퓨터에서 메인/서브에서 닫아 비교해 확인했어요)
# 한컴 프로그램이 모두 꺼져 있을 때, 고른 모니터 밖에 있는 자리를 고른 모니터 가운데로 고쳐 써요.
# 파일 안의 <HCell> <HShow> <Hpdf> 부분은 그 프로그램 몫이고, 나머지는 한글 몫으로 봐요.
# 문서 이름 등 다른 내용은 건드리지 않고 X, Y (필요하면 Width, Height) 숫자만 바꿔요.
$HncProcs = @('Hwp', 'HCell', 'HShow')
$hwpStamp = @{}     # 파일 -> 마지막으로 확인한 시각 (바뀌었을 때만 다시 읽음)

function Repair-HwpPosition {
    if (-not ($want.ContainsKey('hwp') -or $want.ContainsKey('hcell') -or $want.ContainsKey('hshow'))) { return }
    if (Get-Process -Name $HncProcs -ErrorAction SilentlyContinue) { return }   # 켜져 있을 때는 건드리지 않음
    $targets = @{}
    foreach ($n in 'hwp', 'hcell', 'hshow') { if ($want.ContainsKey($n)) { $s = Get-TargetScreen $want[$n]; if ($s) { $targets[$n] = $s } } }
    if ($targets.Count -eq 0) { return }
    $sig = (($targets.Keys | Sort-Object | ForEach-Object { "$_=$($targets[$_].DeviceName)" }) -join ',')
    $root = Join-Path $env:APPDATA 'HNC\User\Common'
    foreach ($file in Get-ChildItem $root -Recurse -Filter 'recentInfo.xml' -ErrorAction SilentlyContinue) {
        $key = "$($file.FullName)|$sig"
        if ($hwpStamp[$key] -eq $file.LastWriteTimeUtc) { continue }
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        # 원래 파일과 같은 글자 방식으로 다시 쓰기 위해 앞부분(BOM)을 확인
        $bom = 0
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $enc = New-Object System.Text.UTF8Encoding($false); $bom = 3 }
        elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { $enc = New-Object System.Text.UnicodeEncoding($false, $false); $bom = 2 }
        elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0x3C -and $bytes[1] -eq 0x00) { $enc = New-Object System.Text.UnicodeEncoding($false, $false) }
        else { $enc = New-Object System.Text.UTF8Encoding($false) }
        $text = $enc.GetString($bytes, $bom, $bytes.Length - $bom)

        # 프로그램별 부분 찾기
        $blocks = @()
        foreach ($b in [regex]::Matches($text, '<(HCell|HShow|Hpdf)>[\s\S]*?</\1>', 'IgnoreCase')) {
            $blocks += @{ S = $b.Index; E = $b.Index + $b.Length; App = $b.Groups[1].Value.ToLower() }
        }

        $sb = New-Object System.Text.StringBuilder
        $last = 0; $changed = $false
        foreach ($m in [regex]::Matches($text, '<PositionInfo\b[^>]*>')) {
            $app = 'hwp'
            foreach ($b in $blocks) { if ($m.Index -ge $b.S -and $m.Index -lt $b.E) { $app = $b.App } }
            if (-not $targets.ContainsKey($app)) { continue }   # 한PDF 등 아직 다루지 않는 부분은 그대로 둠
            $screen = $targets[$app]; $work = $screen.WorkingArea
            $tag = $m.Value
            $v = @{}
            foreach ($n in 'X', 'Y', 'Width', 'Height') {
                $mm = [regex]::Match($tag, '\b' + $n + '="(-?\d+)"')
                if ($mm.Success) { $v[$n] = [int]$mm.Groups[1].Value }
            }
            if ($v.Count -ne 4) { continue }
            if (Test-OnScreen $screen $v.X $v.Y $v.Width $v.Height) { continue }   # 이미 고른 모니터
            $r = Get-CenterRect $v.Width $v.Height $work
            $newTag = $tag -replace '\bX="-?\d+"', "X=`"$($r.X)`"" -replace '\bY="-?\d+"', "Y=`"$($r.Y)`"" -replace '\bWidth="-?\d+"', "Width=`"$($r.W)`"" -replace '\bHeight="-?\d+"', "Height=`"$($r.H)`""
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

# 기억해 둔 창 자리를 모두 고치기 (각 프로그램이 꺼져 있을 때만 고쳐요)
function Repair-All {
    try { Repair-ExcelPosition } catch { }
    try { Repair-WordPosition } catch { }
    try { Repair-PowerPointPosition } catch { }
    try { Repair-HwpPosition } catch { }
    try { Repair-BrowserPosition } catch { }
}
# 창 자리를 기억하는 프로그램: 이 창이 닫히면 몇 초 동안 자주 확인해서 바로 고쳐요
$Remembering = @('excel', 'winword', 'powerpnt', 'hwp', 'hcell', 'hshow', 'chrome', 'msedge', 'brave')
$watchIds = @{}
$fastUntil = [DateTime]::MinValue

$seen = @{}      # 이미 확인한 창
$waiting = @{}   # 막 나타난 창 (프로그램이 스스로 자리 잡을 시간을 조금 줌)

# 켜기 전부터 열려 있던 창은 건드리지 않음
foreach ($w in Get-Windows) { $seen[$w.Id] = $true }

Repair-All
$tick = 0
while (-not $stopSignal.WaitOne(400)) {
    $fast = [DateTime]::Now -lt $fastUntil
    if ((++$tick % 10) -eq 0) { Update-Targets }   # 4초마다 고른 설정 다시 읽기
    if ($fast -or ($tick % 10) -eq 0) { Repair-All }   # 기억해 둔 창 자리 고치기
    $windows = @(Get-Windows)
    $alive = @{}
    foreach ($w in $windows) { $alive[$w.Id] = $true }
    # 창 자리를 기억하는 프로그램의 창이 닫히면, 15초 동안은 자주 확인해서 꺼지는 즉시 고쳐 씀
    foreach ($k in @($watchIds.Keys)) { if (-not $alive.ContainsKey($k)) { $fastUntil = [DateTime]::Now.AddSeconds(15); $watchIds.Remove($k) } }
    foreach ($w in $windows) { if ($Remembering -contains $w.Name) { $watchIds[$w.Id] = $true } }
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
