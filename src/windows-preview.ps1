param([long] $ParentHandle, [long] $ChildHandle)

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class AerialPreview {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect {
        public int Left, Top, Right, Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")]
    public static extern IntPtr GetParent(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    public static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")]
    public static extern int SetWindowLong(IntPtr window, int index, int value);
    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")]
    public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr window);
    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@

$parentWindow = [IntPtr]::new($ParentHandle)
$childWindow = [IntPtr]::new($ChildHandle)
if (-not [AerialPreview]::IsWindow($parentWindow) -or -not [AerialPreview]::IsWindow($childWindow)) {
    throw 'The preview window is no longer available.'
}
[void] [AerialPreview]::SetThreadDpiAwarenessContext([AerialPreview]::GetWindowDpiAwarenessContext($parentWindow))
$parentStyle = [AerialPreview]::GetWindowLong($parentWindow, -16)
[void] [AerialPreview]::SetWindowLong($parentWindow, -16, ($parentStyle -bor 0x02000000))
# GWL_STYLE: clear WS_POPUP, WS_CAPTION and WS_THICKFRAME; add WS_CHILD.
$style = [AerialPreview]::GetWindowLong($childWindow, -16)
$style = ($style -band 0x7F3BFFFF) -bor 0x40000000
[void] [AerialPreview]::SetWindowLong($childWindow, -16, $style)
[void] [AerialPreview]::SetParent($childWindow, $parentWindow)
if ([AerialPreview]::GetParent($childWindow) -ne $parentWindow) {
    throw 'Unable to attach to the Windows screensaver preview.'
}
$previousWidth = -1
$previousHeight = -1
while ([AerialPreview]::IsWindow($parentWindow) -and [AerialPreview]::IsWindow($childWindow)) {
    $rect = New-Object AerialPreview+Rect
    if (-not [AerialPreview]::GetClientRect($parentWindow, [ref] $rect)) {
        break
    }
    $width = [Math]::Max(1, $rect.Right - $rect.Left)
    $height = [Math]::Max(1, $rect.Bottom - $rect.Top)
    $childRect = New-Object AerialPreview+Rect
    [void] [AerialPreview]::GetClientRect($childWindow, [ref] $childRect)
    if ($width -ne $previousWidth -or $height -ne $previousHeight -or
        $width -ne ($childRect.Right - $childRect.Left) -or $height -ne ($childRect.Bottom - $childRect.Top)) {
        # HWND_TOP; SWP_NOACTIVATE | SWP_FRAMECHANGED.
        if (-not [AerialPreview]::SetWindowPos($childWindow, [IntPtr]::Zero, 0, 0, $width, $height, 0x30)) {
            throw 'Unable to resize the screensaver preview.'
        }
        if ($previousWidth -eq -1) {
            [void] [AerialPreview]::ShowWindow($childWindow, 4)
            [Console]::WriteLine('READY')
        }
        $previousWidth = $width
        $previousHeight = $height
    }
    Start-Sleep -Milliseconds 200
}
