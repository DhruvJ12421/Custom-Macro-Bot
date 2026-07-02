import { execFileSync } from 'node:child_process';
import type { WindowInfo, Workflow } from '../../shared/workflow';

const windowScript = String.raw`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MacroWin32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$active = [MacroWin32]::GetForegroundWindow().ToInt64()
$items = foreach ($process in Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle }) {
  $rect = New-Object MacroWin32+RECT
  if ([MacroWin32]::GetWindowRect($process.MainWindowHandle, [ref]$rect)) {
    [PSCustomObject]@{ id = $process.MainWindowHandle.ToInt64(); title = $process.MainWindowTitle; processName = ($process.ProcessName + '.exe'); bounds = [PSCustomObject]@{ x = $rect.Left; y = $rect.Top; width = $rect.Right - $rect.Left; height = $rect.Bottom - $rect.Top }; minimized = [MacroWin32]::IsIconic($process.MainWindowHandle); foreground = ($process.MainWindowHandle.ToInt64() -eq $active) }
  }
}
@($items) | ConvertTo-Json -Depth 4 -Compress
`;

export function listWindows(): WindowInfo[] {
  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', windowScript],
    { encoding: 'utf8', windowsHide: true },
  );
  if (!output.trim()) return [];
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed)) throw new Error('Windows returned an invalid window list');
  return parsed as WindowInfo[];
}

export function resolveTarget(target: Workflow['target']): WindowInfo {
  const found = listWindows().find(
    (win) =>
      win.processName.toLowerCase() === target.processName.toLowerCase() &&
      win.title.toLowerCase().includes(target.titlePattern.toLowerCase()),
  );
  if (!found)
    throw new Error(`Target window is closed: ${target.processName} / ${target.titlePattern}`);
  if (found.minimized) throw new Error('Target window is minimized');
  if (!found.foreground) throw new Error('Target window lost focus; execution paused');
  return found;
}

export function relativeToScreen(window: WindowInfo, point: { x: number; y: number }) {
  if (point.x > window.bounds.width || point.y > window.bounds.height)
    throw new Error(`Point (${point.x}, ${point.y}) is outside the target window`);
  return { x: window.bounds.x + point.x, y: window.bounds.y + point.y };
}
