import { describe, expect, it } from 'vitest';
import type { WindowInfo } from '../../shared/workflow';
import { relativeToScreen } from './windows';

const window: WindowInfo = {
  id: 1,
  title: 'Test',
  processName: 'test.exe',
  bounds: { x: 100, y: 200, width: 800, height: 600 },
  minimized: false,
  foreground: true,
};
describe('coordinate translation', () => {
  it('translates relative points', () =>
    expect(relativeToScreen(window, { x: 20, y: 30 })).toEqual({ x: 120, y: 230 }));
  it('rejects out-of-bounds points', () =>
    expect(() => relativeToScreen(window, { x: 801, y: 2 })).toThrow(/outside/));
});
