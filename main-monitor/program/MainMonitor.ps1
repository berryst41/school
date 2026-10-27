# 메인모니터로 열기 - 한글/엑셀 등 새 창이 열리면 주 모니터(메인 모니터)로 옮겨 줍니다.
# 옮기는 건 창이 "처음 열릴 때 한 번"뿐이라, 쓰는 도중에는 마음대로 다른 모니터로 옮겨도 됩니다.

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

# 같은 프로그램이 두 번 켜지지 않게
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\MainMonitorOpener', [ref]$created)
if (-not $created) { exit }

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class MM {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
        public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    [StructLayout(LayoutKind.Sequential)] public struct WINDOWPLACEMENT {
        public int length; public int flags; public int showCmd;
        public POINT ptMin; public POINT ptMax; public RECT rcNormal; }

    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT p, uint f);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h, ref WINDOWPLACEMENT p);
    [DllImport("user32.dll")] static extern bool SetWindowPlacement(IntPtr h, ref WINDOWPLACEMENT p);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint f);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr v);

    // 모니터마다 배율(%)이 달라도 위치를 정확히 계산하도록
    public static void DpiAware() { try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { } }

    // 화면에 보이는 "진짜 창"만 골라서 (창 번호, 프로세스 번호) 목록으로 돌려줌
    public static List<long[]> TopWindows() {
        DpiAware();
        var list = new List<long[]>();
        EnumWindows((h, l) => {
            if (!IsWindowVisible(h)) return true;
            if (GetWindow(h, 4) != IntPtr.Zero) return true;          // 다른 창에 딸린 창(대화상자 등)은 제외
            if ((GetWindowLong(h, -20) & 0x80) != 0) return true;     // 도구 창 제외
            if (GetWindowTextLength(h) == 0) return true;             // 제목 없는 창 제외
            uint pid; GetWindowThreadProcessId(h, out pid);
            list.Add(new long[] { h.ToInt64(), pid });
            return true;
        }, IntPtr.Zero);
        return list;
    }

    static MONITORINFO Info(IntPtr mon) {
        var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi); GetMonitorInfo(mon, ref mi); return mi;
    }

    // 창이 주 모니터가 아닌 곳에 있으면 주 모니터 가운데로 옮김 (최대화 상태는 유지)
    public static bool MoveToPrimary(long hv) {
        DpiAware();
        IntPtr h = new IntPtr(hv);
        if (!IsWindow(h) || IsIconic(h)) return false;
        var cur = Info(MonitorFromWindow(h, 2));
        if ((cur.dwFlags & 1) != 0) return false;                     // 이미 주 모니터에 있음
        var pri = Info(MonitorFromPoint(new POINT(), 1));
        RECT pw = pri.rcWork;
        int pwW = pw.R - pw.L, pwH = pw.B - pw.T;

        if (IsZoomed(h)) {
            var wp = new WINDOWPLACEMENT(); wp.length = Marshal.SizeOf(wp);
            GetWindowPlacement(h, ref wp);
            int w = Math.Min(wp.rcNormal.R - wp.rcNormal.L, pwW);
            int hh = Math.Min(wp.rcNormal.B - wp.rcNormal.T, pwH);
            int x = pw.L + (pwW - w) / 2, y = pw.T + (pwH - hh) / 2;
            wp.rcNormal.L = x; wp.rcNormal.T = y; wp.rcNormal.R = x + w; wp.rcNormal.B = y + hh;
            wp.showCmd = 3; // 최대화한 채로
            wp.flags = 0;
            SetWindowPlacement(h, ref wp);
        } else {
            RECT r; GetWindowRect(h, out r);
            int w = Math.Min(r.R - r.L, pwW), hh = Math.Min(r.B - r.T, pwH);
            int x = pw.L + (pwW - w) / 2, y = pw.T + (pwH - hh) / 2;
            SetWindowPos(h, IntPtr.Zero, x, y, w, hh, 0x0004 | 0x0010); // NOZORDER | NOACTIVATE
        }
        return true;
    }
}
'@

$targetSet = @{}
foreach ($t in $Targets) { $targetSet[$t.ToLower()] = $true }

$seen = @{}      # 이미 처리한 창
$pending = @{}   # 새로 나타나서 잠깐 기다리는 창 (창 번호 -> 처음 본 시각)
$nameCache = @{}

function Get-ProcName([long]$procId) {
    if (-not $nameCache.ContainsKey($procId)) {
        try { $nameCache[$procId] = (Get-Process -Id $procId -ErrorAction Stop).ProcessName.ToLower() }
        catch { $nameCache[$procId] = '' }
    }
    return $nameCache[$procId]
}

# 프로그램을 켜기 전부터 열려 있던 창은 건드리지 않음
foreach ($w in [MM]::TopWindows()) { $seen[$w[0]] = $true }

while ($true) {
    Start-Sleep -Milliseconds 250
    $now = [DateTime]::Now
    $alive = @{}

    foreach ($w in [MM]::TopWindows()) {
        $h = $w[0]; $alive[$h] = $true
        if ($seen.ContainsKey($h)) { continue }
        if (-not $targetSet.ContainsKey((Get-ProcName $w[1]))) { $seen[$h] = $true; continue }
        if (-not $pending.ContainsKey($h)) { $pending[$h] = $now; continue }
        # 프로그램이 스스로 창 위치를 정할 시간을 조금 준 뒤에 옮김
        if (($now - $pending[$h]).TotalMilliseconds -ge 500) {
            [void][MM]::MoveToPrimary($h)
            $pending.Remove($h); $seen[$h] = $true
        }
    }

    # 닫힌 창 정리
    foreach ($k in @($seen.Keys)) { if (-not $alive.ContainsKey($k)) { $seen.Remove($k) } }
    foreach ($k in @($pending.Keys)) { if (-not $alive.ContainsKey($k)) { $pending.Remove($k) } }
    if ($nameCache.Count -gt 500) { $nameCache.Clear() }
}
