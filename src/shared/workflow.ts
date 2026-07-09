import { z } from 'zod';
import { isValidAccelerator } from './accelerators';

export const pointSchema = z.object({ x: z.number().nonnegative(), y: z.number().nonnegative() });
export const graphPointSchema = z.object({ x: z.number(), y: z.number() });
export const regionSchema = pointSchema.extend({
  width: z.number().positive(),
  height: z.number().positive(),
});
export const colorRegionSchema = regionSchema.extend({
  relativeTo: z.enum(['target', 'screen']).default('target'),
});
const baseNode = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  position: graphPointSchema,
});
const actionKind = z.enum([
  'click',
  'doubleClick',
  'move',
  'mouseDown',
  'mouseUp',
  'drag',
  'scroll',
  'key',
  'shortcut',
  'text',
]);
export const workflowNodeSchema = z.discriminatedUnion('type', [
  baseNode.extend({ type: z.literal('start') }),
  baseNode.extend({ type: z.literal('stop') }),
  baseNode.extend({
    type: z.literal('delay'),
    milliseconds: z.number().int().min(0).max(3_600_000),
  }),
  baseNode.extend({
    type: z.literal('action'),
    kind: actionKind,
    point: pointSchema.optional(),
    endPoint: pointSchema.optional(),
    durationMs: z.number().int().min(0).max(60_000).default(0),
    value: z.string().max(10_000).optional(),
    amount: z.number().int().optional(),
  }),
  baseNode.extend({
    type: z.literal('detectColor'),
    region: colorRegionSchema,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    tolerance: z.number().int().min(0).max(255),
    pollMs: z.number().int().min(50),
    timeoutMs: z.number().int().min(50),
  }),
  baseNode.extend({
    type: z.literal('detectText'),
    region: regionSchema,
    text: z.string().min(1),
    confidence: z.number().min(0).max(100),
    pollMs: z.number().int().min(100),
    timeoutMs: z.number().int().min(100),
  }),
  baseNode.extend({
    type: z.literal('loop'),
    maxIterations: z.number().int().min(1).max(10_000),
    maxDurationMs: z.number().int().min(100).max(86_400_000),
  }),
]);
export const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  targetHandle: z.enum(['entry', 'loopBack']).optional(),
  outcome: z.enum(['next', 'found', 'notFound', 'repeat', 'done']).default('next'),
});
export const workflowSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    target: z.object({ processName: z.string().min(1), titlePattern: z.string().min(1) }),
    safety: z.object({
      countdownSeconds: z.number().int().min(0).max(30),
      emergencyHotkey: z
        .string()
        .refine(isValidAccelerator, 'Emergency stop shortcut must be a valid accelerator')
        .default('F8'),
    }),
    nodes: z.array(workflowNodeSchema).min(1),
    edges: z.array(edgeSchema),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.nodes.map((node) => node.id));
    if (ids.size !== value.nodes.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Node IDs must be unique' });
    if (value.nodes.filter((node) => node.type === 'start').length !== 1)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Workflow requires exactly one start node',
      });
    for (const edge of value.edges)
      if (!ids.has(edge.source) || !ids.has(edge.target))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge ${edge.id} references a missing node`,
        });
  });

export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof edgeSchema>;
export type WindowInfo = {
  id: number;
  title: string;
  processName: string;
  bounds: { x: number; y: number; width: number; height: number };
  minimized: boolean;
  foreground: boolean;
};
export type RunLog = {
  timestamp: string;
  level: 'info' | 'error';
  message: string;
  nodeId?: string;
};

export const defaultWorkflow: Workflow = {
  version: 1,
  name: 'New macro',
  target: { processName: 'not-selected', titlePattern: 'not-selected' },
  safety: { countdownSeconds: 3, emergencyHotkey: 'F8' },
  nodes: [{ id: 'start', type: 'start', label: 'Start', position: { x: 80, y: 100 } }],
  edges: [],
};
