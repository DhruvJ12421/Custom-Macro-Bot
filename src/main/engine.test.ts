import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowEngine } from './engine';
import type { Workflow, WindowInfo } from '../shared/workflow';
import { captureRegion, containsColor, containsText } from './capabilities/screen';
import { performAction, releaseAllInput } from './capabilities/input';
import { focusTarget, resolveTarget } from './capabilities/windows';

vi.mock('./capabilities/windows', () => ({
  focusTarget: vi.fn(),
  resolveTarget: vi.fn(),
}));

vi.mock('./capabilities/input', () => ({
  performAction: vi.fn(),
  releaseAllInput: vi.fn(),
}));

vi.mock('./capabilities/screen', () => ({
  captureRegion: vi.fn(),
  containsColor: vi.fn(),
  containsText: vi.fn(),
}));

const windowInfo: WindowInfo = {
  id: 1,
  title: 'Test target',
  processName: 'test.exe',
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  minimized: false,
  foreground: true,
};

const baseWorkflow: Workflow = {
  version: 1,
  name: 'Engine test',
  target: { processName: 'test.exe', titlePattern: 'Test target' },
  safety: { countdownSeconds: 0, emergencyHotkey: 'F8' },
  nodes: [
    { id: 'start', type: 'start', label: 'Start', position: { x: 0, y: 0 } },
    {
      id: 'action',
      type: 'action',
      label: 'Click',
      position: { x: 100, y: 0 },
      kind: 'click',
      point: { x: 10, y: 10 },
      durationMs: 0,
    },
    { id: 'stop', type: 'stop', label: 'Stop', position: { x: 200, y: 0 } },
  ],
  edges: [
    { id: 'start-action', source: 'start', target: 'action', outcome: 'next' },
    { id: 'action-stop', source: 'action', target: 'stop', outcome: 'next' },
  ],
};

function makeEngine() {
  const logs: string[] = [];
  const states: Array<{ running: boolean; nodeId?: string }> = [];
  const engine = new WorkflowEngine(
    (entry) => logs.push(entry.message),
    (running, nodeId) => states.push({ running, ...(nodeId ? { nodeId } : {}) }),
  );
  return { engine, logs, states };
}

describe('WorkflowEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(focusTarget).mockResolvedValue(windowInfo);
    vi.mocked(resolveTarget).mockReturnValue(windowInfo);
    vi.mocked(performAction).mockResolvedValue(undefined);
    vi.mocked(releaseAllInput).mockResolvedValue(undefined);
    vi.mocked(captureRegion).mockResolvedValue(Buffer.from('png'));
    vi.mocked(containsColor).mockReturnValue(false);
    vi.mocked(containsText).mockResolvedValue(false);
  });

  it('runs a simple start-action-stop workflow and releases held input', async () => {
    const { engine, logs, states } = makeEngine();

    await engine.run(baseWorkflow);

    expect(performAction).toHaveBeenCalledWith(baseWorkflow.nodes[1], windowInfo);
    expect(releaseAllInput).toHaveBeenCalledOnce();
    expect(logs).toContain('Workflow completed');
    expect(states.at(-1)).toEqual({ running: false });
  });

  it('requires explicit outcome routes for detection nodes', async () => {
    vi.mocked(containsText).mockResolvedValue(true);
    const workflow: Workflow = {
      ...baseWorkflow,
      nodes: [
        baseWorkflow.nodes[0]!,
        {
          id: 'detect',
          type: 'detectText',
          label: 'Find text',
          position: { x: 100, y: 0 },
          region: { x: 0, y: 0, width: 100, height: 30 },
          text: 'Ready',
          confidence: 50,
          pollMs: 100,
          timeoutMs: 100,
        },
        baseWorkflow.nodes[2]!,
      ],
      edges: [
        { id: 'start-detect', source: 'start', target: 'detect', outcome: 'next' },
        { id: 'detect-stop', source: 'detect', target: 'stop', outcome: 'next' },
      ],
    };
    const { engine } = makeEngine();

    await expect(engine.run(workflow)).rejects.toThrow("No 'found' route from Find text");
    expect(releaseAllInput).toHaveBeenCalledOnce();
  });
});
