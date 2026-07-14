import { describe, expect, it } from 'vitest';
import { defaultWorkflow, workflowSchema } from './workflow';

describe('workflow schema', () => {
  it('accepts the default workflow', () =>
    expect(workflowSchema.parse(defaultWorkflow)).toEqual(defaultWorkflow));
  it('rejects invalid finite loop limits', () =>
    expect(() =>
      workflowSchema.parse({
        ...defaultWorkflow,
        nodes: [
          ...defaultWorkflow.nodes,
          {
            id: 'loop',
            type: 'loop',
            label: 'Loop',
            position: { x: 0, y: 0 },
            maxIterations: 0,
            maxDurationMs: 0,
          },
        ],
      }),
    ).toThrow());
  it('accepts infinite loops explicitly', () =>
    expect(
      workflowSchema.parse({
        ...defaultWorkflow,
        nodes: [
          ...defaultWorkflow.nodes,
          {
            id: 'loop',
            type: 'loop',
            label: 'Loop',
            position: { x: 0, y: 0 },
            maxIterations: 1,
            maxDurationMs: 100,
            infinite: true,
          },
        ],
      }).nodes[1],
    ).toMatchObject({ type: 'loop', infinite: true }));
  it('rejects dangling edges', () =>
    expect(() =>
      workflowSchema.parse({
        ...defaultWorkflow,
        edges: [{ id: 'bad', source: 'start', target: 'missing', outcome: 'next' }],
      }),
    ).toThrow(/missing node/));
  it('requires exactly one start', () =>
    expect(() =>
      workflowSchema.parse({
        ...defaultWorkflow,
        nodes: defaultWorkflow.nodes.filter((n) => n.type !== 'start'),
      }),
    ).toThrow(/one start/));
  it('allows negative graph positions', () =>
    expect(
      workflowSchema.parse({
        ...defaultWorkflow,
        nodes: defaultWorkflow.nodes.map((node) =>
          node.id === 'start' ? { ...node, position: { x: -120, y: -80 } } : node,
        ),
      }).nodes[0]?.position,
    ).toEqual({ x: -120, y: -80 }));
  it('accepts symbol-based emergency stop accelerators', () =>
    expect(
      workflowSchema.parse({
        ...defaultWorkflow,
        safety: { ...defaultWorkflow.safety, emergencyHotkey: 'Control+Slash' },
      }).safety.emergencyHotkey,
    ).toBe('Control+Slash'));
});
