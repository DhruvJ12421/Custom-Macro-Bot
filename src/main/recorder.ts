import { uIOhook, UiohookKey } from 'uiohook-napi';
import type { WorkflowNode, WindowInfo } from '../shared/workflow';

const modifierKeys = new Set<number>([
  UiohookKey.Ctrl,
  UiohookKey.CtrlRight,
  UiohookKey.Alt,
  UiohookKey.AltRight,
  UiohookKey.Shift,
  UiohookKey.ShiftRight,
  UiohookKey.Meta,
  UiohookKey.MetaRight,
]);
const keyName = (keycode: number): string =>
  Object.entries(UiohookKey).find(([, value]) => value === keycode)?.[0] ?? `Key${keycode}`;
const normalizeKeyName = (name: string): string =>
  ({
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    Backquote: 'Grave',
    BracketLeft: 'LeftBracket',
    BracketRight: 'RightBracket',
    Numpad0: 'NumPad0',
    Numpad1: 'NumPad1',
    Numpad2: 'NumPad2',
    Numpad3: 'NumPad3',
    Numpad4: 'NumPad4',
    Numpad5: 'NumPad5',
    Numpad6: 'NumPad6',
    Numpad7: 'NumPad7',
    Numpad8: 'NumPad8',
    Numpad9: 'NumPad9',
    NumpadAdd: 'Add',
    NumpadSubtract: 'Subtract',
    NumpadMultiply: 'Multiply',
    NumpadDivide: 'Divide',
    NumpadDecimal: 'Decimal',
    PrintScreen: 'Print',
  })[name] ?? name;

export class Recorder {
  private events: WorkflowNode[] = [];
  private started = 0;
  private last = 0;
  private lastClickAt = 0;
  private lastClickScreen: { x: number; y: number } | undefined;
  private window: WindowInfo | undefined;
  start(window: WindowInfo) {
    if (this.started) throw new Error('Recorder is already running');
    this.window = window;
    this.started = this.last = Date.now();
    const delay = () => {
      const now = Date.now();
      const ms = now - this.last;
      this.last = now;
      if (ms > 50)
        this.events.push({
          id: crypto.randomUUID(),
          type: 'delay',
          label: `Wait ${ms}ms`,
          position: { x: 0, y: 0 },
          milliseconds: ms,
        });
    };
    uIOhook.on('click', (e) => {
      delay();
      if (!this.window) return;
      this.lastClickAt = Date.now();
      this.lastClickScreen = { x: e.x, y: e.y };
      this.events.push({
        id: crypto.randomUUID(),
        type: 'action',
        label: 'Click',
        position: { x: 0, y: 0 },
        kind: 'click',
        point: { x: e.x - this.window.bounds.x, y: e.y - this.window.bounds.y },
        durationMs: 0,
      });
    });
    uIOhook.on('wheel', (e) => {
      delay();
      if (!this.window) return;
      this.events.push({
        id: crypto.randomUUID(),
        type: 'action',
        label: 'Scroll',
        position: { x: 0, y: 0 },
        kind: 'scroll',
        point: { x: e.x - this.window.bounds.x, y: e.y - this.window.bounds.y },
        amount: e.rotation,
        durationMs: 0,
      });
    });
    uIOhook.on('keydown', (e) => {
      if (modifierKeys.has(e.keycode)) return;
      delay();
      const keys = [
        e.ctrlKey ? 'Control' : undefined,
        e.altKey ? 'Alt' : undefined,
        e.shiftKey ? 'Shift' : undefined,
        e.metaKey ? 'Meta' : undefined,
        normalizeKeyName(keyName(e.keycode)),
      ].filter((key): key is string => !!key);
      const value = keys.join('+');
      this.events.push({
        id: crypto.randomUUID(),
        type: 'action',
        label: `Shortcut ${value}`,
        position: { x: 0, y: 0 },
        kind: 'shortcut',
        value,
        durationMs: 0,
      });
    });
    uIOhook.start();
  }
  stop(ignoreRecentClickWithin?: { x: number; y: number; width: number; height: number }) {
    if (!this.started) return [];
    uIOhook.stop();
    uIOhook.removeAllListeners();
    const finalEvent = this.events.at(-1);
    const point = this.lastClickScreen;
    const shouldIgnoreFinalClick =
      finalEvent?.type === 'action' &&
      finalEvent.kind === 'click' &&
      point &&
      ignoreRecentClickWithin &&
      Date.now() - this.lastClickAt < 1_000 &&
      point.x >= ignoreRecentClickWithin.x &&
      point.y >= ignoreRecentClickWithin.y &&
      point.x < ignoreRecentClickWithin.x + ignoreRecentClickWithin.width &&
      point.y < ignoreRecentClickWithin.y + ignoreRecentClickWithin.height;
    if (shouldIgnoreFinalClick) {
      this.events.pop();
      if (this.events.at(-1)?.type === 'delay') this.events.pop();
    }
    const result = this.events;
    this.events = [];
    this.started = 0;
    this.lastClickAt = 0;
    this.lastClickScreen = undefined;
    this.window = undefined;
    return result;
  }
}
