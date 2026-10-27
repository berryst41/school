# 메인 모니터로 열기
# 한글·엑셀 등의 창이 새로 열리면 주 모니터(메인 모니터) 가운데로 옮겨 줍니다.
# 창이 처음 열릴 때 한 번만 옮기므로, 쓰는 도중에는 다른 모니터로 마음대로 옮겨도 됩니다.
# 윈도우에 들어 있는 "UI 자동화" 기능만 사용합니다.

# ▼ 메인 모니터에서 열리게 할 프로그램 목록 (원하면 이름을 더하거나 빼세요)
$Targets = @(
    'Hwp',       # 한글
    'HCell',     # 한셀
    'HShow',     # 한쇼
    'HwpViewer', # 한글 뷰어
    'EXCEL',     # 엑셀
    'WINWORD',   # 워드
    'POWERPNT',  # 파워포인트
    'AcroRd32', 'Acrobat'  # PDF (아크로뱃)
)

$Host.UI.RawUI.WindowTitle = '메인 모니터로 열기 (작동 중)'
Write-Host ''
Write-Host '  메인 모니터로 열기가 작동하고 있어요.'
Write-Host '  이 창은 작게 줄여 두기만 하고 닫지 마세요.'
Write-Host '  (닫으면 다음에 컴퓨터를 켤 때까지 꺼져요)'

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

$want = @{}
foreach ($t in $Targets) { $want[$t.ToLower()] = $true }
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
            try { if ($el.Current.NativeWindowHandle -eq 0) { continue }; $list += [pscustomobject]@{ Id = $el.Current.NativeWindowHandle; Pid = $el.Current.ProcessId; El = $el } } catch { }
        }
    } catch { }
    $list
}

function Move-ToPrimary($el) {
    $work = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $r = $el.Current.BoundingRectangle
    if ($r.IsEmpty) { return }
    $cx = [int]($r.X + $r.Width / 2); $cy = [int]($r.Y + $r.Height / 2)
    if ([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Contains($cx, $cy)) { return }   # 이미 메인 모니터에 있음

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

$seen = @{}      # 이미 확인한 창
$waiting = @{}   # 막 나타난 창 (프로그램이 스스로 자리 잡을 시간을 조금 줌)

# 켜기 전부터 열려 있던 창은 건드리지 않음
foreach ($w in Get-Windows) { $seen[$w.Id] = $true }

while (-not $stopSignal.WaitOne(400)) {
    $alive = @{}
    foreach ($w in Get-Windows) {
        $alive[$w.Id] = $true
        if ($seen.ContainsKey($w.Id)) { continue }
        if (-not $want.ContainsKey((Get-ProcName $w.Pid))) { $seen[$w.Id] = $true; continue }
        if (-not $waiting.ContainsKey($w.Id)) { $waiting[$w.Id] = $true; continue }
        try { Move-ToPrimary $w.El } catch { }
        $waiting.Remove($w.Id); $seen[$w.Id] = $true
    }
    foreach ($k in @($seen.Keys))    { if (-not $alive.ContainsKey($k)) { $seen.Remove($k) } }
    foreach ($k in @($waiting.Keys)) { if (-not $alive.ContainsKey($k)) { $waiting.Remove($k) } }
    if ($nameOf.Count -gt 300) { $nameOf.Clear() }
}
