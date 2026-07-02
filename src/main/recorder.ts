import { uIOhook, UiohookKey } from 'uiohook-napi';
import type { WorkflowNode, WindowInfo } from '../shared/workflow';

export class Recorder {
  private events: WorkflowNode[] = [];
  private started = 0;
  private last = 0;
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
      this.events.push({
        id: crypto.randomUUID(),
        type: 'action',
        label: 'Scroll',
        position: { x: 0, y: 0 },
        kind: 'scroll',
        amount: e.rotation,
        durationMs: 0,
      });
    });
    uIOhook.on('keydown', (e) => {
      delay();
      const name =
        Object.entries(UiohookKey).find(([, value]) => value === e.keycode)?.[0] ??
        `Key${e.keycode}`;
      this.events.push({
        id: crypto.randomUUID(),
        type: 'action',
        label: `Key ${name}`,
        position: { x: 0, y: 0 },
        kind: 'key',
        value: name,
        durationMs: 0,
      });
    });
    uIOhook.start();
  }
  stop() {
    if (!this.started) return [];
    uIOhook.stop();
    uIOhook.removeAllListeners();
    const result = this.events;
    this.events = [];
    this.started = 0;
    this.window = undefined;
    return result;
  }
}
