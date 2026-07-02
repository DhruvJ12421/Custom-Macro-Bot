import { describe, expect, it } from 'vitest';
import { defaultWorkflow, workflowSchema } from './workflow';

describe('workflow schema', () => {
  it('accepts the default workflow', () =>
    expect(workflowSchema.parse(defaultWorkflow)).toEqual(defaultWorkflow));
  it('requires bounded loops', () =>
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
});
