import { Button, Key, keyboard, mouse, Point, straightTo } from '@nut-tree-fork/nut-js';
import type { WorkflowNode, WindowInfo } from '../../shared/workflow';
import { relativeToScreen } from './windows';

const heldButtons = new Set<Button>();
const button = Button.LEFT;
const aliases: Record<string, Key> = {
  Control: Key.LeftControl,
  Ctrl: Key.LeftControl,
  Shift: Key.LeftShift,
  Alt: Key.LeftAlt,
  F8: Key.F8,
};
const resolveKey = (name: string): Key | undefined =>
  aliases[name] ?? (Key as unknown as Record<string, Key>)[name];

async function at(win: WindowInfo, p: { x: number; y: number }) {
  const q = relativeToScreen(win, p);
  await mouse.setPosition(new Point(q.x, q.y));
}
export async function performAction(
  node: Extract<WorkflowNode, { type: 'action' }>,
  win: WindowInfo,
) {
  if (node.point) await at(win, node.point);
  switch (node.kind) {
    case 'click':
      await mouse.click(button);
      break;
    case 'doubleClick':
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
      const keys = (node.value ?? '')
        .split('+')
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
