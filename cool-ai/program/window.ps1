# 쿨메신저 비서 - 항상 위에 뜨는 작은 창
. (Join-Path $PSScriptRoot 'common.ps1')
$ErrorActionPreference = 'Continue'   # 창에서는 작은 오류로 멈추지 않게
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms, System.Drawing

# 한 번만 켜지게: 이미 켜져 있으면 그 창을 앞으로 부르고 끝
$created = $false
$winMutex = New-Object Threading.Mutex($true, 'Local\CoolAIWindow', [ref]$created)
$showEvent = New-Object Threading.EventWaitHandle($false, 'AutoReset', 'Local\CoolAIShow')
if (-not $created) { [void]$showEvent.Set(); exit }
$stopEvent = New-Object Threading.EventWaitHandle($false, 'ManualReset', 'Local\CoolAIStop')

Add-Type -ReferencedAssemblies ([Windows.Interop.HwndSource].Assembly.Location), ([Windows.Threading.Dispatcher].Assembly.Location) -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Interop;
public class CoolHotkey {
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    public Action Pressed;
    IntPtr hwnd;
    public bool Register(IntPtr h, uint mod, uint vk) {
        hwnd = h;
        HwndSource.FromHwnd(h).AddHook(Hook);
        return RegisterHotKey(h, 0x5A11, mod | 0x4000, vk);
    }
    IntPtr Hook(IntPtr h, int msg, IntPtr w, IntPtr l, ref bool handled) {
        if (msg == 0x0312 && w.ToInt32() == 0x5A11) { handled = true; if (Pressed != null) Pressed(); }
        return IntPtr.Zero;
    }
    public void Unregister() { if (hwnd != IntPtr.Zero) UnregisterHotKey(hwnd, 0x5A11); }
    // 다른 창들 뒤로 보내기 (HWND_BOTTOM, 크기·위치 그대로, 포커스 안 뺏기)
    public static void SendToBottom(IntPtr h) { SetWindowPos(h, new IntPtr(1), 0, 0, 0, 0, 0x0013); }
}
'@

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="쿨메신저 비서" Width="340" Height="520" MinWidth="240" MinHeight="150"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        ResizeMode="CanResizeWithGrip" Topmost="True" ShowInTaskbar="False"
        FontFamily="Malgun Gothic" FontSize="13">
  <Window.Resources>
    <Style TargetType="Button">
      <Setter Property="Foreground" Value="White"/>
      <Setter Property="FontSize" Value="13"/>
      <Setter Property="Width" Value="26"/>
      <Setter Property="Height" Value="24"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="b" Background="Transparent" CornerRadius="5">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="b" Property="Background" Value="#33FFFFFF"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>
  <Border CornerRadius="10" Background="#FFFDFDFD" BorderBrush="#40000000" BorderThickness="1">
    <DockPanel>
      <Border x:Name="Header" DockPanel.Dock="Top" Background="#FF3B5BDB" CornerRadius="9,9,0,0" Padding="10,5,6,5" Cursor="SizeAll">
        <DockPanel>
          <StackPanel DockPanel.Dock="Right" Orientation="Horizontal" Cursor="Arrow">
            <TextBlock Text="◐" Foreground="White" VerticalAlignment="Center" Margin="0,0,3,0" ToolTip="투명도"/>
            <Slider x:Name="Opa" Width="58" Minimum="0.25" Maximum="1" Value="1" VerticalAlignment="Center" Margin="0,0,4,0"
                    ToolTip="투명도 (창 위에서 Ctrl + 마우스 휠로도 바꿀 수 있어요)"/>
            <Button x:Name="BtnAdd" Content="➕" ToolTip="직접 넣기 (쪽지가 없어도 할 일·일정·알아 둘 것을 넣어요. AI 비서에도 넘어가요)"/>
            <Button x:Name="BtnPin" Content="📌"/>
            <Button x:Name="BtnRefresh" Content="⟳" ToolTip="지금 쿨메신저 쪽지 확인하기"/>
            <Button x:Name="BtnSet" Content="⚙" ToolTip="설정 (API 키·단축키 등)"/>
            <Button x:Name="BtnMin" Content="—" ToolTip="창 숨기기 (F9 나 바탕화면 아이콘으로 다시 불러와요)"/>
            <Button x:Name="BtnClose" Content="✕" ToolTip="비서 끄기"/>
          </StackPanel>
          <TextBlock x:Name="TitleText" Text="쿨메신저 비서" Foreground="White" FontWeight="Bold" VerticalAlignment="Center"/>
        </DockPanel>
      </Border>
      <Border x:Name="AddBox" DockPanel.Dock="Top" Visibility="Collapsed" Background="#FFEDF2FF" Padding="8,6,8,6">
        <StackPanel>
          <DockPanel Margin="0,0,0,4">
            <ComboBox x:Name="AddKind" DockPanel.Dock="Left" Width="108" Margin="0,0,4,0" SelectedIndex="0">
              <ComboBoxItem Content="✅ 마감 할 일"/>
              <ComboBoxItem Content="📅 일정"/>
              <ComboBoxItem Content="💡 알아 둘 것"/>
            </ComboBox>
            <TextBox x:Name="AddText" VerticalContentAlignment="Center" ToolTip="무엇을 넣을까요? (Enter: 넣기, Esc: 닫기)"/>
          </DockPanel>
          <DockPanel LastChildFill="False">
            <DatePicker x:Name="AddDate" DockPanel.Dock="Left" Width="118" Margin="0,0,4,0" ToolTip="마감일·날짜 (알아 둘 것은 없어도 돼요)"/>
            <TextBox x:Name="AddTime" DockPanel.Dock="Left" Width="48" VerticalContentAlignment="Center" ToolTip="시각 (예: 14:30, 없어도 돼요)"/>
            <Button x:Name="AddCancel" DockPanel.Dock="Right" Content="닫기" Width="38" Foreground="#FF495057"/>
            <Button x:Name="AddOk" DockPanel.Dock="Right" Content="넣기" Width="40" Foreground="#FF3B5BDB" FontWeight="Bold"/>
          </DockPanel>
        </StackPanel>
      </Border>
      <Border DockPanel.Dock="Bottom" Padding="10,4,18,4" Background="#FFF1F3F5" CornerRadius="0,0,9,9">
        <DockPanel>
          <TextBlock x:Name="DoneToggle" DockPanel.Dock="Right" FontSize="11" Foreground="#FF3B5BDB" Cursor="Hand" Margin="8,0,0,0"/>
          <TextBlock x:Name="StatusText" FontSize="11" Foreground="#FF666666" TextTrimming="CharacterEllipsis"/>
        </DockPanel>
      </Border>
      <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="8,2,8,6">
        <StackPanel x:Name="List"/>
      </ScrollViewer>
    </DockPanel>
  </Border>
</Window>
'@
$win = [Windows.Markup.XamlReader]::Load((New-Object Xml.XmlNodeReader $xaml))
$ui = @{}
foreach ($n in 'AddBox', 'AddKind', 'AddText', 'AddDate', 'AddTime', 'AddOk', 'AddCancel', 'BtnAdd', 'Header', 'Opa', 'BtnPin','BtnRefresh', 'BtnSet', 'BtnMin', 'BtnClose', 'TitleText', 'DoneToggle', 'StatusText', 'List') { $ui[$n] = $win.FindName($n) }

$Script:Settings  = Read-Settings
$Script:Done      = @{}
$Script:DoneStamp = ''
# done.json은 이 창과 AI 비서 PC 일꾼(폰 앱에서 체크한 것)이 함께 써요 → 바뀌면 다시 읽어요
function Load-Done {
    $Script:Done = @{}
    foreach ($d in @(Read-JsonFile $DoneJson @())) { if ($d) { $Script:Done[[string]$d] = $true } }
    $Script:DoneStamp = if (Test-Path $DoneJson) { (Get-Item $DoneJson).LastWriteTimeUtc.Ticks } else { 0 }
}
Load-Done
$Script:Seen      = $null      # 처음 그릴 때 본 항목들 (그 뒤에 생긴 건 '새 항목')
$Script:NewIds    = @{}
$Script:ShowDone  = $false
$Script:Collapsed = @{}
$Script:Pinned    = $true
$Script:ItemsStamp = ''; $Script:StatusStamp = ''; $Script:Day = (Get-Date).Date
$Script:Engine    = $null

# ── 창 위치·투명도 되살리기 ──
$saved = Read-JsonFile $UiJson $null
$wa = [Windows.SystemParameters]::WorkArea
$win.Left = $wa.Right - 360; $win.Top = $wa.Bottom - 540
if ($saved) {
    $vl = [Windows.SystemParameters]::VirtualScreenLeft; $vt = [Windows.SystemParameters]::VirtualScreenTop
    $vr = $vl + [Windows.SystemParameters]::VirtualScreenWidth; $vb = $vt + [Windows.SystemParameters]::VirtualScreenHeight
    if ($saved.w -ge 240) { $win.Width = $saved.w }
    if ($saved.h -ge 150) { $win.Height = $saved.h }
    if ($saved.x -ge $vl -and $saved.x -lt ($vr - 80) -and $saved.y -ge $vt -and $saved.y -lt ($vb - 40)) { $win.Left = $saved.x; $win.Top = $saved.y }
    if ($saved.opacity -ge 0.25) { $ui.Opa.Value = $saved.opacity }
    if ($null -ne $saved.pinned) { $Script:Pinned = [bool]$saved.pinned }
    foreach ($c in @($saved.collapsed)) { if ($c) { $Script:Collapsed[[string]$c] = $true } }
}
$win.Opacity = $ui.Opa.Value
$win.Topmost = $Script:Pinned

function Save-Ui {
    Write-JsonFile $UiJson ([ordered]@{ x = $win.Left; y = $win.Top; w = $win.Width; h = $win.Height
        opacity = [Math]::Round($ui.Opa.Value, 2); pinned = $Script:Pinned; collapsed = @($Script:Collapsed.Keys) })
}

function Update-PinButton {
    $key = $Script:Settings['단축키']
    if ($Script:Pinned) { $ui.BtnPin.Opacity = 1; $ui.BtnPin.ToolTip = "맨 위에 고정됨 (누르면 풀려서 다른 창이 위로 올 수 있어요) · $key" }
    else { $ui.BtnPin.Opacity = 0.45; $ui.BtnPin.ToolTip = "고정 안 됨 (누르면 맨 위에 고정) · $key" }
}

function Set-Pinned([bool]$on) {
    $Script:Pinned = $on
    $win.Topmost = $on
    Update-PinButton
    Save-Ui
}

function Bring-Up {
    if ($win.WindowState -eq 'Minimized') { $win.WindowState = 'Normal' }
    $win.ShowActivated = $true
    if (-not $win.IsVisible) { $win.Show() }

    Set-Pinned $true
    [void]$win.Activate()
}

function Send-Back {
    Set-Pinned $false
    [CoolHotkey]::SendToBottom((New-Object Windows.Interop.WindowInteropHelper $win).Handle)
}

# ── 항목 그리기 ──
function Get-Date-Or-Null($s, $fmt) {
    $d = [datetime]::MinValue
    if ($s -and [datetime]::TryParseExact($s, $fmt, [Globalization.CultureInfo]::InvariantCulture, 'None', [ref]$d)) { return $d }
    return $null
}

# ── 직접 넣은 항목 (my.json) — 쪽지에서 나온 게 아니라 이 창(my-…)이나 AI 비서 앱(app-…)에서 넣은 것 ──
function Test-Mine($it) { return ([string]$it.id) -match '^(my|app)-' }
function Get-AllItems {
    $a = New-Object Collections.ArrayList
    foreach ($it in @(Read-JsonFile $ItemsJson @())) { if ($it) { [void]$a.Add($it) } }
    foreach ($it in @(Read-JsonFile $MyJson @())) { if ($it) { [void]$a.Add($it) } }
    return $a
}
function Add-MyItem($kind, $text, $due, $time) {
    $now = Get-Date
    $mine = New-Object Collections.ArrayList
    foreach ($it in @(Read-JsonFile $MyJson @())) { if ($it) { [void]$mine.Add($it) } }   # 쓰기 바로 전에 다시 읽기(PC 일꾼도 이 파일을 써요)
    [void]$mine.Add([pscustomobject]@{
        id = 'my-' + $now.ToString('yyyyMMddHHmmssfff'); msg = $null; kind = $kind; text = $text; due = $due; time = $time; fav = $false
        sender = '✍️ 직접'; recv = $now.ToString('yyyy\/MM\/dd HH:mm', [Globalization.CultureInfo]::InvariantCulture)
        added = $now.ToString('yyyy-MM-dd HH:mm:ss')
    })
    Write-JsonFile $MyJson @($mine)
}
function Remove-MyItem($id) {
    $mine = @(Read-JsonFile $MyJson @()) | Where-Object { $_ -and [string]$_.id -ne $id }
    Write-JsonFile $MyJson @($mine)
    $Script:ItemsStamp = ''
}

function Show-Original($item) {
    if (Test-Mine $item) { return }   # 직접 넣은 건 원래 쪽지가 없어요
    $all =Read-JsonFile $MsgsJson ([pscustomobject]@{})
    $m = $all.([string]$item.msg)
    $w = New-Object Windows.Window
    $w.Title = if ($m) { $m.title } else { '원래 쪽지' }
    $w.Width = 460; $w.Height = 520; $w.Topmost = $true; $w.Owner = $win
    $w.WindowStartupLocation = 'CenterOwner'; $w.FontFamily = 'Malgun Gothic'; $w.FontSize = 13
    $tb = New-Object Windows.Controls.TextBox
    $tb.IsReadOnly = $true; $tb.TextWrapping = 'Wrap'; $tb.VerticalScrollBarVisibility = 'Auto'; $tb.Padding = '10'; $tb.BorderThickness = '0'
    if ($m) {
        $head = "보낸 사람: $($m.sender)`r`n받은 때: $($m.date)`r`n"
        if ($m.files) { $head += "첨부: $($m.files)`r`n" }
        $tb.Text = "$head`r`n[$($m.title)]`r`n`r`n" + ($m.body -replace "`n", "`r`n")
    } else { $tb.Text = '원래 쪽지를 찾지 못했어요.' }
    $w.Content = $tb
    $w.Show()
}

function New-ItemRow($it, $today) {
    $isDone = $Script:Done.ContainsKey([string]$it.id)
    $row = New-Object Windows.Controls.Border
    $row.Padding = '4,4,4,4'; $row.Margin = '0,1,0,1'; $row.CornerRadius = '5'
    $row.ToolTip = '두 번 누르면 원래 쪽지를 볼 수 있어요'
    if ($Script:NewIds.ContainsKey([string]$it.id)) { $row.Background = '#FFFFF3BF' } else { $row.Background = 'Transparent' }
    $g = New-Object Windows.Controls.DockPanel
    $cb = New-Object Windows.Controls.CheckBox
    $cb.IsChecked = $isDone; $cb.Margin = '0,2,6,0'; $cb.VerticalAlignment = 'Top'; $cb.Tag = [string]$it.id
    $cb.ToolTip = '다 했으면 체크'
    $cb.Add_Click({
        param($s, $e)
        $id = [string]$s.Tag
        Load-Done   # 다른 곳(폰 앱)에서 바뀐 것을 먼저 받아서 지우지 않게
        if ($s.IsChecked) { $Script:Done[$id] = $true } else { $Script:Done.Remove($id) }
        Write-JsonFile $DoneJson @($Script:Done.Keys)
        $Script:DoneStamp = (Get-Item $DoneJson).LastWriteTimeUtc.Ticks
        Render-List
    })
    [Windows.Controls.DockPanel]::SetDock($cb, 'Left')
    [void]$g.Children.Add($cb)

    $tb = New-Object Windows.Controls.TextBlock
    $tb.TextWrapping = 'Wrap'
    $r1 = [Windows.Documents.Run]::new([string]$it.text)
    if ($isDone) { $r1.Foreground = '#FF999999'; $r1.TextDecorations = [Windows.TextDecorations]::Strikethrough }
    [void]$tb.Inlines.Add($r1)
    [void]$tb.Inlines.Add((New-Object Windows.Documents.LineBreak))

    $meta = New-Object Collections.ArrayList
    $color = '#FF868E96'
    $due = Get-Date-Or-Null $it.due 'yyyy-MM-dd'
    if ($due) {
        $diff = ($due.Date - $today).Days
        $dow = '일월화수목금토'[[int]$due.DayOfWeek]
        $label = if ($diff -eq 0) { '오늘' } elseif ($diff -eq 1) { '내일' } else { "D-$diff" }
        $s = "$label · $($due.Month)/$($due.Day)($dow)"
        if ($it.time) { $s += " $($it.time)" }
        [void]$meta.Add($s)
        if (-not $isDone) { if ($diff -le 0) { $color = '#FFE03131' } elseif ($diff -le 2) { $color = '#FFE8590C' } }
    } elseif ($it.time) { [void]$meta.Add([string]$it.time) }
    $who = ([string]$it.sender -split '\(')[0].Trim()
    if ($who) { [void]$meta.Add($who) }
    if ($it.fav) { [void]$meta.Add('★') }
    $r2 = [Windows.Documents.Run]::new($meta -join ' · ')
    $r2.FontSize = 11; $r2.Foreground = $color
    [void]$tb.Inlines.Add($r2)
    [void]$g.Children.Add($tb)
    $row.Child = $g
    $row.Tag = $it
    $row.Add_MouseLeftButtonDown({ param($s, $e) if ($e.ClickCount -eq 2) { Show-Original $s.Tag; $e.Handled = $true } })
    return $row
}

function Render-List {
    $today = (Get-Date).Date
    $items = @(Read-JsonFile $ItemsJson @())
    if ($null -eq $Script:Seen) {
        $Script:Seen = @{}; foreach ($it in $items) { $Script:Seen[[string]$it.id] = $true }
    }
    $fresh = 0
    foreach ($it in $items) {
        if (-not $Script:Seen.ContainsKey([string]$it.id)) {
            $Script:Seen[[string]$it.id] = $true; $Script:NewIds[[string]$it.id] = $true
            if ($it.kind -ne 'remember') { $fresh++ }
        }
    }

    $live = New-Object Collections.ArrayList; $doneList = New-Object Collections.ArrayList
    foreach ($it in $items) {
        $due = Get-Date-Or-Null $it.due 'yyyy-MM-dd'
        if ($due -and $due.Date -lt $today) { continue }                 # 기한 지난 건 숨기기
        if (-not $due -and $it.kind -eq 'remember' -and -not $it.fav) {                     # 기한 없는 '기억할 것'은 30일 동안만
            $rd = Get-Date-Or-Null $it.recv 'yyyy/MM/dd HH:mm'
            if ($rd -and ($today - $rd.Date).Days -gt 30) { continue }
        }
        if ($Script:Done.ContainsKey([string]$it.id)) { [void]$doneList.Add($it) } else { [void]$live.Add($it) }
    }

    $ui.List.Children.Clear()
    $sections = @(
        @{ kind = 'todo';     title = '✅ 마감 할 일';   color = '#FFC92A2A' },
        @{ kind = 'note';     title = '📅 일정';         color = '#FF1971C2' },
        @{ kind = 'remember'; title = '💡 알아 둘 것';   color = '#FF2B8A3E' }
    )
    $sortKey = { param($x) $(if ($x.due) { "$($x.due) $($x.time)" } else { '9999' }) + " $($x.recv)" }
    foreach ($sec in $sections) {
        $list = @($live | Where-Object { $_.kind -eq $sec.kind })
        if ($sec.kind -eq 'remember') { $list = @($list | Sort-Object { $_.recv } -Descending) }
        else { $list = @($list | Sort-Object { & $sortKey $_ }) }
        $ex = New-Object Windows.Controls.Expander
        $hd = New-Object Windows.Controls.TextBlock
        $hd.Text = "$($sec.title)  $($list.Count)"; $hd.FontWeight = 'Bold'; $hd.Foreground = $sec.color; $hd.FontSize = 14
        $ex.Header = $hd; $ex.Margin = '0,6,0,0'; $ex.Tag = $sec.kind
        $ex.IsExpanded = -not $Script:Collapsed.ContainsKey($sec.kind)
        $ex.Add_Collapsed({ param($s, $e) $Script:Collapsed[[string]$s.Tag] = $true; Save-Ui })
        $ex.Add_Expanded({ param($s, $e) $Script:Collapsed.Remove([string]$s.Tag); Save-Ui })
        $sp = New-Object Windows.Controls.StackPanel
        $sp.Margin = '4,2,0,0'
        if ($list.Count -eq 0) {
            $e = New-Object Windows.Controls.TextBlock; $e.Text = '없어요'; $e.Foreground = '#FFADB5BD'; $e.FontSize = 12; $e.Margin = '22,2,0,2'
            [void]$sp.Children.Add($e)
        }
        foreach ($it in $list) { [void]$sp.Children.Add((New-ItemRow $it $today)) }
        $ex.Content = $sp
        [void]$ui.List.Children.Add($ex)
    }
    if ($Script:ShowDone -and $doneList.Count -gt 0) {
        $hd = New-Object Windows.Controls.TextBlock
        $hd.Text = "☑ 다 한 것  $($doneList.Count)  (체크를 풀면 되돌아가요)"; $hd.Foreground = '#FF868E96'; $hd.Margin = '0,10,0,2'; $hd.FontSize = 12
        [void]$ui.List.Children.Add($hd)
        foreach ($it in $doneList) { [void]$ui.List.Children.Add((New-ItemRow $it $today)) }
    }
    $ui.DoneToggle.Text = if ($doneList.Count -eq 0) { '' } elseif ($Script:ShowDone) { '다 한 것 숨기기' } else { "다 한 것 $($doneList.Count)개 보기" }

    $todo = @($live | Where-Object { $_.kind -eq 'todo' }).Count
    $ui.TitleText.Text = if ($todo -gt 0) { "할 일 $todo" } else { '쿨메신저 비서' }
    if ($Script:Tray) { $Script:Tray.Text = if ($todo -gt 0) { "쿨메신저 비서 · 할 일 $todo (클릭: 맨 위로)" } else { '쿨메신저 비서 (클릭: 맨 위로)' } }

    if ($fresh -gt 0 -and $Script:Settings['새_항목_알림'] -ne '아니오' -and -not $win.IsActive) {
        # 새 할 일·일정이 생기면 포커스는 뺏지 않고 잠깐 맨 앞으로 보여 주기
        if ($win.WindowState -eq 'Minimized') { $win.WindowState = 'Normal' }
        if (-not $win.IsVisible) { $win.ShowActivated = $false; $win.Show() }   # 숨겨 둔 창도 포커스는 뺏지 않고 보여 주기
        if (-not $Script:Pinned) { $win.Topmost = $true; $win.Topmost = $false }
    }
}

function Update-Status {
    $st = Read-JsonFile $StatusJson $null
    if (-not $st) { $ui.StatusText.Text = '⏳ 준비하는 중…'; return }
    $ago = ''
    $t = Get-Date-Or-Null $st.time 'yyyy-MM-dd HH:mm:ss'
    if ($t) {
        $m = [int]((Get-Date) - $t).TotalMinutes
        $ago = if ($m -lt 1) { '방금' } elseif ($m -lt 60) { "$m분 전" } else { $t.ToString('M/d HH:mm', [Globalization.CultureInfo]::InvariantCulture) }
    }
    switch ($st.state) {
        'ok'      { $ui.StatusText.Foreground = '#FF666666'; $ui.StatusText.Text = "● $ago 확인 · $($st.msg)" }
        'working' { $ui.StatusText.Foreground = '#FF1971C2'; $ui.StatusText.Text = "⏳ $($st.msg)" }
        default   { $ui.StatusText.Foreground = '#FFE03131'; $ui.StatusText.Text = "⚠ $($st.msg)" }
    }
    $ui.StatusText.ToolTip = $ui.StatusText.Text
}

function Start-Engine {
    $ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $eng = Join-Path $PSScriptRoot 'engine.ps1'
    $Script:Engine = Start-Process $ps -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$eng`" -ParentPid $PID" -WindowStyle Hidden -PassThru
}

# ── 단추·마우스 ──
$ui.Header.Add_MouseLeftButtonDown({ param($s, $e) if ($e.ButtonState -eq 'Pressed') { try { $win.DragMove() } catch {} } })
$ui.Opa.Add_ValueChanged({ $win.Opacity = $ui.Opa.Value })
$ui.Opa.Add_LostMouseCapture({ Save-Ui })
$win.Add_PreviewMouseWheel({
    param($s, $e)
    if ([Windows.Input.Keyboard]::Modifiers -band [Windows.Input.ModifierKeys]::Control) {
        $ui.Opa.Value = [Math]::Max(0.25, [Math]::Min(1, $ui.Opa.Value + ($e.Delta / 120) * 0.05))
        $e.Handled = $true; Save-Ui
    }
})
$ui.BtnPin.Add_Click({ Set-Pinned (-not $Script:Pinned) })
$ui.BtnRefresh.Add_Click({ [IO.File]::WriteAllText($ForceFile, 'go'); $ui.StatusText.Text = '⏳ 확인하는 중…' })
$ui.BtnSet.Add_Click({ [void](Read-Settings); Start-Process notepad.exe -ArgumentList "`"$SettingsTxt`"" })
$ui.StatusText.Add_MouseLeftButtonUp({ if ($ui.StatusText.Text -match 'API 키|모델') { Start-Process notepad.exe -ArgumentList "`"$SettingsTxt`"" } })
$ui.BtnMin.Add_Click({ Save-Ui; $win.Hide() })   # 작업 표시줄에 안 뜨니 내리지 않고 숨겨요
$ui.BtnClose.Add_Click({ $win.Close() })
$ui.DoneToggle.Add_MouseLeftButtonUp({ $Script:ShowDone = -not $Script:ShowDone; Render-List })
$win.Add_Activated({ if ($Script:NewIds.Count -gt 0) { $Script:NewIds = @{}; Render-List } })
$win.Add_LocationChanged({ $Script:UiDirty = $true })
$win.Add_SizeChanged({ $Script:UiDirty = $true })

# ── 단축키 ──
$hotkey = New-Object CoolHotkey
$hotkey.Pressed = [Action]{ if ($Script:Pinned -and $win.IsVisible -and $win.WindowState -ne 'Minimized') { Send-Back } else { Bring-Up } }
$win.Add_SourceInitialized({
    $spec = [string]$Script:Settings['단축키']; if (-not $spec) { $spec = 'F9' }
    $mod = 0; $vk = 0
    foreach ($p in ($spec -split '\+')) {
        $p = $p.Trim().ToUpper()
        switch -regex ($p) {
            '^(CTRL|CONTROL)$' { $mod = $mod -bor 2; continue }
            '^ALT$'            { $mod = $mod -bor 1; continue }
            '^SHIFT$'          { $mod = $mod -bor 4; continue }
            '^WIN$'            { $mod = $mod -bor 8; continue }
            '^F([1-9]|1[0-9]|2[0-4])$' { $vk = 0x6F + [int]$Matches[1]; continue }
            '^[A-Z0-9]$'       { $vk = [int][char]$p; continue }
        }
    }
    if ($vk -eq 0) { $vk = 0x78; $spec = 'F9' }
    $h = (New-Object Windows.Interop.WindowInteropHelper $win).Handle
    if (-not $hotkey.Register($h, [uint32]$mod, [uint32]$vk)) {
        $Script:HotkeyError = "단축키 $spec 를 다른 프로그램이 쓰고 있어요. ⚙ 설정에서 바꿔 주세요"
    }
    Update-PinButton
})

# ── 2초마다: 새 정리 결과·상태 확인, 신호 확인 ──
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(2)
$Script:Tick = 0
$timer.Add_Tick({
    try {
        if ($stopEvent.WaitOne(0)) { $win.Close(); return }
        if ($showEvent.WaitOne(0)) { Bring-Up }
        $Script:Tick++
        $is = if (Test-Path $ItemsJson) { (Get-Item $ItemsJson).LastWriteTimeUtc.Ticks } else { 0 }
        $ss = if (Test-Path $StatusJson) { (Get-Item $StatusJson).LastWriteTimeUtc.Ticks } else { 0 }
        $ds = if (Test-Path $DoneJson) { (Get-Item $DoneJson).LastWriteTimeUtc.Ticks } else { 0 }
        if ($ds -ne $Script:DoneStamp) { Load-Done; $Script:ItemsStamp = '' }   # 폰 앱에서 체크한 게 들어오면 다시 그리기
        if ($is -ne $Script:ItemsStamp -or (Get-Date).Date -ne $Script:Day) {
            $Script:ItemsStamp = $is; $Script:Day = (Get-Date).Date; Render-List
        }
        if ($ss -ne $Script:StatusStamp -or $Script:Tick % 15 -eq 0) { $Script:StatusStamp = $ss; Update-Status }
        if ($Script:HotkeyError) { $ui.StatusText.Foreground = '#FFE03131'; $ui.StatusText.Text = "⚠ $($Script:HotkeyError)" }
        if ($Script:Tick % 15 -eq 0) {
            $Script:Settings = Read-Settings
            if ($Script:Engine -and $Script:Engine.HasExited) { Start-Engine }   # 엔진이 멈췄으면 다시 켜기
        }
        if ($Script:UiDirty -and $Script:Tick % 3 -eq 0) { $Script:UiDirty = $false; Save-Ui }
    } catch { Write-Log "창 오류: $($_.Exception.Message)" }
})


# ── 알림 영역(작업 표시줄 오른쪽 ^ ) 아이콘: 클릭하면 맨 위로 ──
function New-TrayIcon {
    $bmp = New-Object Drawing.Bitmap 32, 32
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $path = New-Object Drawing.Drawing2D.GraphicsPath
    $path.AddArc(1, 1, 12, 12, 180, 90); $path.AddArc(19, 1, 12, 12, 270, 90)
    $path.AddArc(19, 19, 12, 12, 0, 90); $path.AddArc(1, 19, 12, 12, 90, 90); $path.CloseFigure()
    $g.FillPath((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(59, 91, 219))), $path)
    $pen = New-Object Drawing.Pen ([Drawing.Color]::White), 4.5
    $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
    $g.DrawLines($pen, [Drawing.Point[]]@((New-Object Drawing.Point 8, 17), (New-Object Drawing.Point 14, 23), (New-Object Drawing.Point 25, 10)))
    $g.Dispose()
    return [Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$Script:Tray = New-Object Windows.Forms.NotifyIcon
$Script:Tray.Icon = New-TrayIcon
$Script:Tray.Text = '쿨메신저 비서 (클릭: 맨 위로)'
$Script:Tray.Add_MouseClick({ param($s, $e) try { if ($e.Button -eq [Windows.Forms.MouseButtons]::Left) { Bring-Up } } catch { Write-Log "트레이 오류: $($_.Exception.Message)" } })
$menu = New-Object Windows.Forms.ContextMenuStrip
[void]$menu.Items.Add('맨 위로 올리기', $null, { Bring-Up })
[void]$menu.Items.Add('숨기기', $null, { Save-Ui; $win.Hide() })
[void]$menu.Items.Add('지금 쪽지 확인', $null, { [IO.File]::WriteAllText($ForceFile, 'go') })
[void]$menu.Items.Add('설정', $null, { Start-Process notepad.exe -ArgumentList "`"$SettingsTxt`"" })
[void]$menu.Items.Add('-')
[void]$menu.Items.Add('비서 끄기', $null, { $win.Close() })
$Script:Tray.ContextMenuStrip = $menu
$Script:Tray.Visible = $true

$win.Add_Closing({
    $timer.Stop()
    Save-Ui
    $hotkey.Unregister()
    try { $Script:Tray.Visible = $false; $Script:Tray.Dispose() } catch {}
    try { if ($Script:Engine -and -not $Script:Engine.HasExited) { $Script:Engine.Kill() } } catch {}
})

Update-PinButton
Render-List
Update-Status
Start-Engine
$timer.Start()
# ShowDialog 대신 Application.Run: 숨겼다(Hide) 다시 보여도(Show) 프로그램이 끝나지 않게
$app = New-Object Windows.Application
$app.ShutdownMode = 'OnMainWindowClose'
[void]$app.Run($win)
