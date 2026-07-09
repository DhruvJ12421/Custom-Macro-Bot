import { execFileSync } from 'node:child_process';
import { getWindows as getNativeWindows, mouse } from '@nut-tree-fork/nut-js';
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

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function focusResolved(resolve: () => WindowInfo | undefined): Promise<WindowInfo> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = resolve();
    if (!candidate) {
      lastError = new Error('Selected target window is unavailable');
      continue;
    }
    try {
      const nativeWindows = await getNativeWindows();
      const titledWindows = await Promise.all(
        nativeWindows.map(async (window) => ({ window, title: await window.getTitle() })),
      );
      const matching = titledWindows.filter(({ title }) => title === candidate.title);
      if (matching.length === 0) throw new Error('Selected target window is unavailable');
      const withRegions = await Promise.all(
        matching.map(async ({ window }) => ({ window, region: await window.getRegion() })),
      );
      const selected = withRegions.sort(
        (left, right) =>
          Math.abs(left.region.left - candidate.bounds.x) +
          Math.abs(left.region.top - candidate.bounds.y) -
          Math.abs(right.region.left - candidate.bounds.x) -
          Math.abs(right.region.top - candidate.bounds.y),
      )[0];
      if (!selected) throw new Error('Selected target window is unavailable');
      await selected.window.focus();
      await wait(100);
      const refreshed = listWindows().find(
        (window) =>
          window.foreground &&
          window.processName.toLowerCase() === candidate.processName.toLowerCase() &&
          window.title === candidate.title,
      );
      if (refreshed?.foreground) return refreshed;
      lastError = new Error('Target window did not retain focus');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not focus the target window');
}

export function focusSelectedWindow(selected: WindowInfo): Promise<WindowInfo> {
  return focusResolved(() => {
    const windows = listWindows();
    return (
      windows.find((window) => window.id === selected.id) ??
      windows.find(
        (window) =>
          window.processName.toLowerCase() === selected.processName.toLowerCase() &&
          window.title === selected.title,
      )
    );
  });
}

export function focusTarget(target: Workflow['target']): Promise<WindowInfo> {
  return focusResolved(() =>
    listWindows().find(
      (win) =>
        win.processName.toLowerCase() === target.processName.toLowerCase() &&
        win.title.toLowerCase().includes(target.titlePattern.toLowerCase()),
    ),
  );
}

export function relativeToScreen(window: WindowInfo, point: { x: number; y: number }) {
  if (point.x > window.bounds.width || point.y > window.bounds.height)
    throw new Error(`Point (${point.x}, ${point.y}) is outside the target window`);
  return { x: window.bounds.x + point.x, y: window.bounds.y + point.y };
}

export async function getRelativeCursorPosition(window: WindowInfo) {
  const position = await mouse.getPosition();
  return {
    x: Math.max(0, Math.round(position.x - window.bounds.x)),
    y: Math.max(0, Math.round(position.y - window.bounds.y)),
  };
}
