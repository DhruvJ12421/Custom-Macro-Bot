import { Button, Key, keyboard, mouse, Point, straightTo } from '@nut-tree-fork/nut-js';
import { parseAccelerator } from '../../shared/accelerators';
import type { WorkflowNode, WindowInfo } from '../../shared/workflow';
import { relativeToScreen } from './windows';

const heldButtons = new Set<Button>();
const button = Button.LEFT;
const aliases: Record<string, Key> = {
  Control: Key.LeftControl,
  Ctrl: Key.LeftControl,
  Shift: Key.LeftShift,
  Alt: Key.LeftAlt,
  Meta: Key.LeftMeta,
  Win: Key.LeftWin,
  Command: Key.LeftCmd,
  Cmd: Key.LeftCmd,
  Return: Key.Return,
  ArrowUp: Key.Up,
  ArrowDown: Key.Down,
  ArrowLeft: Key.Left,
  ArrowRight: Key.Right,
  Backquote: Key.Grave,
  '`': Key.Grave,
  Minus: Key.Minus,
  '-': Key.Minus,
  Equal: Key.Equal,
  '=': Key.Equal,
  Plus: Key.Equal,
  BracketLeft: Key.LeftBracket,
  '[': Key.LeftBracket,
  BracketRight: Key.RightBracket,
  ']': Key.RightBracket,
  Backslash: Key.Backslash,
  '\\': Key.Backslash,
  Semicolon: Key.Semicolon,
  ';': Key.Semicolon,
  Quote: Key.Quote,
  "'": Key.Quote,
  Comma: Key.Comma,
  ',': Key.Comma,
  Period: Key.Period,
  '.': Key.Period,
  Slash: Key.Slash,
  '/': Key.Slash,
  F8: Key.F8,
};
const resolveKey = (name: string): Key | undefined => {
  const normalized = name.trim();
  if (/^[a-z]$/i.test(normalized))
    return (Key as unknown as Record<string, Key>)[normalized.toUpperCase()];
  if (/^[0-9]$/.test(normalized))
    return (Key as unknown as Record<string, Key>)[`Num${normalized}`];
  return aliases[normalized] ?? (Key as unknown as Record<string, Key>)[normalized];
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function at(win: WindowInfo, p: { x: number; y: number }) {
  const q = relativeToScreen(win, p);
  await mouse.setPosition(new Point(q.x, q.y));
}

async function prepareRobloxClick(win: WindowInfo, point: { x: number; y: number }) {
  const target = relativeToScreen(win, point);
  const targetPoint = new Point(target.x, target.y);
  await mouse.setPosition(targetPoint);
  await sleep(150);
  await mouse.move(straightTo(new Point(target.x + 2, target.y + 2)));
  await sleep(20);
  await mouse.move(straightTo(targetPoint));
  await sleep(100);
}

async function standardClick(win: WindowInfo, point: { x: number; y: number }) {
  await prepareRobloxClick(win, point);
  await mouse.pressButton(button);
  heldButtons.add(button);
  await mouse.releaseButton(button);
  heldButtons.delete(button);
}

export async function performAction(
  node: Extract<WorkflowNode, { type: 'action' }>,
  win: WindowInfo,
) {
  if (node.point && node.kind !== 'click' && node.kind !== 'doubleClick') await at(win, node.point);
  switch (node.kind) {
    case 'click':
      if (!node.point) throw new Error('Click requires a location');
      await standardClick(win, node.point);
      break;
    case 'doubleClick':
      if (!node.point) throw new Error('Double click requires a location');
      await prepareRobloxClick(win, node.point);
      await mouse.doubleClick(button);
      break;
    case 'move':
      break;
    case 'mouseDown':
      await mouse.pressButton(button);
      heldButtons.add(button);
      break;
    case 'mouseUp':
      await mouse.releaseButton(button);
      heldButtons.delete(button);
      break;
    case 'drag': {
      if (!node.endPoint) throw new Error('Drag requires an end point');
      const end = relativeToScreen(win, node.endPoint);
      await mouse.drag(straightTo(new Point(end.x, end.y)));
      break;
    }
    case 'scroll': {
      if (!node.point) throw new Error('Scroll requires a location');
      await at(win, node.point);
      const amount = node.amount ?? 1;
      if (amount < 0) await mouse.scrollUp(Math.abs(amount));
      else await mouse.scrollDown(amount);
      break;
    }
    case 'text':
      await keyboard.type(node.value ?? '');
      break;
    case 'key': {
      const key = resolveKey(node.value ?? '');
      if (key === undefined) throw new Error(`Unsupported key: ${node.value}`);
      await keyboard.pressKey(key);
      await keyboard.releaseKey(key);
      break;
    }
    case 'shortcut': {
      const keys = parseAccelerator(node.value ?? '')
        .map((k) => resolveKey(k.trim()))
        .filter((k): k is Key => k !== undefined);
      if (!keys.length) throw new Error('Shortcut has no supported keys');
      await keyboard.pressKey(...keys);
      await keyboard.releaseKey(...keys.reverse());
      break;
    }
  }
}
export async function releaseAllInput() {
  for (const held of heldButtons) await mouse.releaseButton(held);
  heldButtons.clear();
}
