import {
  memo,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import {
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
  useNodesState,
} from '@xyflow/react';
import { shortcutFromKeyboardEvent } from '../shared/accelerators';
import {
  defaultWorkflow,
  workflowSchema,
  type RunLog,
  type WindowInfo,
  type Workflow,
  type WorkflowNode,
} from '../shared/workflow';
import appIcon from '../../assets/icon-master.png';

const palette: WorkflowNode['type'][] = [
  'action',
  'delay',
  'detectColor',
  'detectText',
  'loop',
  'stop',
];

type RouteOutcome = Workflow['edges'][number]['outcome'];
type MacroFlowNode = Node<
  { label: string; nodeType: WorkflowNode['type']; outcomes: RouteOutcome[] },
  'macro'
>;

const routeLabels: Record<RouteOutcome, string> = {
  next: 'Next',
  found: 'Found',
  notFound: 'Not found',
  repeat: 'Repeat',
  done: 'Done',
};

function outcomesFor(type: WorkflowNode['type']): RouteOutcome[] {
  if (type === 'stop') return [];
  if (type === 'detectColor' || type === 'detectText') return ['found', 'notFound'];
  if (type === 'loop') return ['repeat', 'done'];
  return ['next'];
}

function loopTargetHandle(
  workflow: Workflow,
  edge: Workflow['edges'][number],
): 'entry' | 'loopBack' | null {
  if (edge.targetHandle) return edge.targetHandle;
  const target = workflow.nodes.find((node) => node.id === edge.target);
  if (target?.type !== 'loop') return null;
  const repeatStart = workflow.edges.find(
    (candidate) => candidate.source === target.id && candidate.outcome === 'repeat',
  )?.target;
  if (!repeatStart) return 'entry';
  const visited = new Set<string>();
  const queue = [repeatStart];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === edge.source) return 'loopBack';
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(
      ...workflow.edges
        .filter((candidate) => candidate.source === current && candidate.id !== edge.id)
        .map((candidate) => candidate.target),
    );
  }
  return 'entry';
}

function issueFrom(error: unknown, workflow: Workflow, title: string): UiIssue {
  const detail = error instanceof Error ? error.message : String(error);
  const validationIssues = (
    error as { issues?: Array<{ path?: Array<string | number>; message: string }> }
  )?.issues;
  const first = validationIssues?.[0];
  const nodeIndex = first?.path?.[0] === 'nodes' ? first.path[1] : undefined;
  const node = typeof nodeIndex === 'number' ? workflow.nodes[nodeIndex] : undefined;
  return {
    title: node ? `Check "${node.label}"` : title,
    detail: first?.message ?? detail,
    ...(node ? { nodeId: node.id } : {}),
  };
}

function useWorkflowHistory(initial: Workflow) {
  const [workflow, setCurrent] = useState(initial);
  const past = useRef<Workflow[]>([]);
  const future = useRef<Workflow[]>([]);
  const setWorkflow = useCallback((action: SetStateAction<Workflow>) => {
    setCurrent((current) => {
      const next = typeof action === 'function' ? action(current) : action;
      if (next === current) return current;
      past.current = [...past.current.slice(-99), current];
      future.current = [];
      return next;
    });
  }, []);
  const undo = useCallback(() => {
    setCurrent((current) => {
      const previous = past.current.pop();
      if (!previous) return current;
      future.current.push(current);
      return previous;
    });
  }, []);
  const redo = useCallback(() => {
    setCurrent((current) => {
      const next = future.current.pop();
      if (!next) return current;
      past.current.push(current);
      return next;
    });
  }, []);
  return {
    workflow,
    setWorkflow,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

const MacroNode = memo(function MacroNode({ data, selected }: NodeProps<MacroFlowNode>) {
  return (
    <div className={`macro-node node-${data.nodeType} ${selected ? 'selected' : ''}`}>
      {data.nodeType === 'loop' ? (
        <div className="loop-inputs">
          <div className="loop-input loop-entry">
            <Handle id="entry" type="target" position={Position.Left} />
            <span>Enter</span>
          </div>
          <div className="loop-input loop-back">
            <Handle id="loopBack" type="target" position={Position.Left} />
            <span>Loop back</span>
          </div>
        </div>
      ) : data.nodeType !== 'start' ? (
        <Handle type="target" position={Position.Left} />
      ) : null}
      <div className="node-icon">{data.nodeType.slice(0, 1).toUpperCase()}</div>
      <div className="node-copy">
        <span className="macro-node-type">{data.nodeType}</span>
        <strong>{data.label}</strong>
      </div>
      <div className="route-list">
        {data.outcomes.map((outcome, index) => (
          <div className={`route-pill route-${outcome}`} key={outcome}>
            {routeLabels[outcome]}
            <Handle
              id={outcome}
              type="source"
              position={Position.Right}
              style={{ top: `${((index + 1) / (data.outcomes.length + 1)) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

const nodeTypes: NodeTypes = { macro: MacroNode };

function Icon({
  name,
}: {
  name: 'refresh' | 'undo' | 'redo' | 'play' | 'stop' | 'settings' | 'close';
}) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M13.5 3.5v3.25h-3.25" />
          <path d="M13 7.25A5.5 5.5 0 1 1 11.3 3.3L13.5 5.5" />
        </svg>
      );
    case 'undo':
      return (
        <svg {...common}>
          <path d="M6 4 2.5 7.5 6 11" />
          <path d="M3 7.5h6.25a4.25 4.25 0 1 1 0 8.5H8.5" />
        </svg>
      );
    case 'redo':
      return (
        <svg {...common}>
          <path d="m10 4 3.5 3.5L10 11" />
          <path d="M13 7.5H6.75a4.25 4.25 0 1 0 0 8.5h.75" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="M5 3.75v8.5l7-4.25-7-4.25Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'stop':
      return (
        <svg {...common}>
          <rect
            x="4.25"
            y="4.25"
            width="7.5"
            height="7.5"
            rx="1.25"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path d="M8 1.9 9.35 2.3l.75 1.2 1.42-.06.95 1.04-.42 1.35.92 1.08-.92 1.08.42 1.35-.95 1.04-1.42-.06-.75 1.2L8 14.1l-1.35-.4-.75-1.2-1.42.06-.95-1.04.42-1.35-.92-1.08.92-1.08-.42-1.35.95-1.04 1.42.06.75-1.2L8 1.9Z" />
          <circle cx="8" cy="8" r="2.1" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="m4 4 8 8M12 4 4 12" />
        </svg>
      );
  }
}

function repairEmptyStarterGraph(workflow: Workflow): Workflow {
  if (workflow.edges.length !== 0 || workflow.nodes.length !== 2) return workflow;
  const start = workflow.nodes.find((node) => node.type === 'start');
  const stop = workflow.nodes.find((node) => node.type === 'stop');
  if (!start || !stop) return workflow;
  return {
    ...workflow,
    edges: [
      {
        id: crypto.randomUUID(),
        source: start.id,
        target: stop.id,
        outcome: 'next',
      },
    ],
  };
}

function normalizeWorkflow(workflow: Workflow): Workflow {
  return repairEmptyStarterGraph({
    ...workflow,
    nodes: workflow.nodes.map((node) => {
      if (node.type === 'action' && node.kind === 'key')
        return { ...node, kind: 'shortcut', label: node.label.replace(/^Key\b/, 'Shortcut') };
      if (node.type === 'detectColor')
        return {
          ...node,
          region: { ...node.region, relativeTo: node.region.relativeTo ?? 'target' },
        };
      return node;
    }),
  });
}

function makeNode(type: WorkflowNode['type'], index: number): WorkflowNode {
  const base = {
    id: crypto.randomUUID(),
    type,
    label: type,
    position: { x: 240 + index * 30, y: 160 + index * 35 },
  } as const;
  switch (type) {
    case 'action':
      return { ...base, type, kind: 'click', point: { x: 50, y: 50 }, durationMs: 0 };
    case 'delay':
      return { ...base, type, milliseconds: 500 };
    case 'detectColor':
      return {
        ...base,
        type,
        region: { x: 0, y: 0, width: 100, height: 100, relativeTo: 'target' },
        color: '#ff0000',
        tolerance: 10,
        pollMs: 200,
        timeoutMs: 5000,
      };
    case 'detectText':
      return {
        ...base,
        type,
        region: { x: 0, y: 0, width: 200, height: 80 },
        text: 'Continue',
        confidence: 60,
        pollMs: 500,
        timeoutMs: 5000,
      };
    case 'loop':
      return { ...base, type, maxIterations: 11, maxDurationMs: 60_000 };
    case 'stop':
      return { ...base, type };
    case 'start':
      return { ...base, type };
  }
}

type InspectorProps = {
  node: WorkflowNode;
  onChange: (node: WorkflowNode) => void;
  onPick: () => void;
  onPickPoint: (key: 'point' | 'endPoint') => void;
  onDebugText: () => void;
  onDebugColor: () => void;
  textDebug?: TextDebugResult | undefined;
  colorDebug?: ColorDebugResult | undefined;
  debuggingText: boolean;
  debuggingColor: boolean;
  canRecord: boolean;
  hasExistingNodes: boolean;
  recording: boolean;
  onRecord: () => void;
  onDelete: () => void;
  currentMousePoint?: { x: number; y: number } | undefined;
};

type TextDebugResult = {
  passed: boolean;
  recognizedText: string;
  confidence: number;
  reason: string;
};
type ColorDebugResult = {
  passed: boolean;
  reason: string;
};
type ThemeName = 'midnight' | 'graphite' | 'slate' | 'light';

type UiIssue = { title: string; detail: string; nodeId?: string };

type ConnectionMenuState = {
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
  source: string;
  outcome: RouteOutcome;
  query: string;
};

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = max === undefined ? Math.max(min, parsed) : Math.min(max, Math.max(min, parsed));
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
    </label>
  );
}

function ShortcutCapture({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      readOnly
      onKeyDown={(event) => {
        const shortcut = shortcutFromKeyboardEvent(event);
        if (!shortcut) return;
        event.preventDefault();
        onChange(shortcut);
      }}
      onFocus={(event) => event.currentTarget.select()}
    />
  );
}

const NodeInspector = memo(function NodeInspector({
  node,
  onChange,
  onPick,
  onPickPoint,
  onDebugText,
  onDebugColor,
  textDebug,
  colorDebug,
  debuggingText,
  debuggingColor,
  canRecord,
  hasExistingNodes,
  recording,
  onRecord,
  onDelete,
  currentMousePoint,
}: InspectorProps) {
  const patch = (values: Partial<WorkflowNode>) => onChange({ ...node, ...values } as WorkflowNode);
  const pointFields = (title: string, key: 'point' | 'endPoint') => {
    if (node.type !== 'action') return null;
    const point = node[key] ?? { x: 0, y: 0 };
    return (
      <fieldset>
        <legend>{title}</legend>
        <div className="field-grid">
          <NumberField
            label="X"
            value={point.x}
            onChange={(x) => patch({ [key]: { ...point, x } })}
          />
          <NumberField
            label="Y"
            value={point.y}
            onChange={(y) => patch({ [key]: { ...point, y } })}
          />
        </div>
        <button className="secondary wide" onClick={() => onPickPoint(key)}>
          Pick location from target
        </button>
      </fieldset>
    );
  };
  const regionFields =
    node.type === 'detectColor' || node.type === 'detectText' ? (
      <fieldset>
        <legend>Screen region</legend>
        <div className="field-grid">
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <NumberField
              key={key}
              label={key[0]!.toUpperCase() + key.slice(1)}
              value={node.region[key]}
              min={key === 'width' || key === 'height' ? 1 : 0}
              onChange={(value) => patch({ region: { ...node.region, [key]: value } })}
            />
          ))}
        </div>
        <button className="secondary wide" onClick={onPick}>
          {node.type === 'detectColor' && node.region.relativeTo === 'screen'
            ? 'Pick anywhere on screen'
            : 'Pick from target window'}
        </button>
      </fieldset>
    ) : null;

  return (
    <div className="inspector-form">
      <div className="inspector-heading">
        <div className="node-icon">{node.type.slice(0, 1).toUpperCase()}</div>
        <div>
          <span>{node.type}</span>
          <strong>{node.label}</strong>
        </div>
      </div>
      <label className="field">
        <span>Node name</span>
        <input value={node.label} onChange={(event) => patch({ label: event.target.value })} />
      </label>
      {node.type === 'start' && (canRecord || recording) && (
        <div className="record-card">
          <strong>{recording ? 'Recording actions' : 'Record a new workflow'}</strong>
          <p>
            {recording
              ? 'Interact with the target window, then finish to create nodes.'
              : hasExistingNodes
                ? 'Starting will replace the existing nodes after confirmation.'
                : 'Interact with the target window to create action nodes automatically.'}
          </p>
          <button className={recording ? 'danger wide' : 'record wide'} onClick={onRecord}>
            <i /> {recording ? 'Finish recording' : 'Start recording'}
          </button>
        </div>
      )}
      {node.type === 'delay' && (
        <NumberField
          label="Delay (milliseconds)"
          value={node.milliseconds}
          max={3_600_000}
          onChange={(milliseconds) => patch({ milliseconds })}
        />
      )}
      {node.type === 'action' && (
        <>
          <label className="field">
            <span>Action</span>
            <select
              value={node.kind}
              onChange={(event) => {
                const nextKind = event.target.value as typeof node.kind;
                if (nextKind !== 'drag' || node.kind === 'drag') {
                  patch({ kind: nextKind });
                  return;
                }
                patch({
                  kind: nextKind,
                  endPoint: node.point ?? node.endPoint ?? { x: 0, y: 0 },
                  point: currentMousePoint ?? node.point ?? { x: 0, y: 0 },
                });
              }}
            >
              <option value="click">Click</option>
              <option value="doubleClick">Double click</option>
              <option value="move">Move mouse</option>
              <option value="mouseDown">Mouse down</option>
              <option value="mouseUp">Mouse up</option>
              <option value="drag">Drag</option>
              <option value="scroll">Scroll</option>
              <option value="shortcut">Press key combination</option>
              <option value="text">Type text</option>
            </select>
          </label>
          {['click', 'doubleClick', 'move', 'mouseDown', 'mouseUp', 'drag', 'scroll'].includes(
            node.kind,
          ) && pointFields('Position', 'point')}
          {node.kind === 'drag' && pointFields('End position', 'endPoint')}
          {node.kind === 'drag' && (
            <p className="field-help">
              Drag starts from <strong>Position</strong> and ends at <strong>End position</strong>.
              When you switch into Drag, the previous coordinates become the end point and the
              current mouse location becomes the start when available.
            </p>
          )}
          {node.kind === 'move' && (
            <NumberField
              label="Duration (ms)"
              value={node.durationMs}
              max={60_000}
              onChange={(durationMs) => patch({ durationMs })}
            />
          )}
          {node.kind === 'scroll' && (
            <NumberField
              label="Scroll amount"
              value={node.amount ?? 0}
              min={-100_000}
              max={100_000}
              onChange={(amount) => patch({ amount })}
            />
          )}
          {['move', 'mouseDown', 'mouseUp'].includes(node.kind) && (
            <p className="field-help">
              {node.kind === 'move'
                ? 'Move only positions the cursor. It does not click.'
                : node.kind === 'mouseDown'
                  ? 'Mouse down holds the left button at this position until a later Mouse up node.'
                  : 'Mouse up releases a button held by an earlier Mouse down node.'}
            </p>
          )}
          {['shortcut', 'text'].includes(node.kind) && (
            <label className="field">
              <span>{node.kind === 'text' ? 'Text' : 'Press key combination'}</span>
              {node.kind === 'text' ? (
                <textarea
                  value={node.value ?? ''}
                  onChange={(event) => patch({ value: event.target.value })}
                />
              ) : (
                <ShortcutCapture
                  value={node.value ?? ''}
                  placeholder="Focus this field, then press keys"
                  onChange={(value) => patch({ value })}
                />
              )}
            </label>
          )}
        </>
      )}
      {regionFields}
      {node.type === 'detectColor' && (
        <>
          <label className="field">
            <span>Screen color</span>
            <div className="color-field">
              <input
                type="color"
                value={node.color}
                onChange={(event) => patch({ color: event.target.value })}
              />
              <input
                value={node.color}
                pattern="#[0-9a-fA-F]{6}"
                onChange={(event) => patch({ color: event.target.value })}
              />
            </div>
          </label>
          <label className="field">
            <span>Region coordinates</span>
            <select
              value={node.region.relativeTo ?? 'target'}
              onChange={(event) =>
                patch({
                  region: {
                    ...node.region,
                    relativeTo: event.target.value as 'target' | 'screen',
                  },
                })
              }
            >
              <option value="target">Target window</option>
              <option value="screen">Whole screen</option>
            </select>
          </label>
          <NumberField
            label="Color tolerance"
            value={node.tolerance}
            max={255}
            onChange={(tolerance) => patch({ tolerance })}
          />
          <button className="debug-text wide" disabled={debuggingColor} onClick={onDebugColor}>
            {debuggingColor ? 'Checking color…' : 'Test color tolerance now'}
          </button>
          {colorDebug && (
            <div className={`text-debug-result ${colorDebug.passed ? 'passed' : 'failed'}`}>
              <div>
                <strong>{colorDebug.passed ? 'Passed' : 'Failed'}</strong>
                <span>{node.tolerance} tolerance</span>
              </div>
              <p>{colorDebug.reason}</p>
            </div>
          )}
        </>
      )}
      {node.type === 'detectText' && (
        <>
          <label className="field">
            <span>Text to find</span>
            <input value={node.text} onChange={(event) => patch({ text: event.target.value })} />
          </label>
          <NumberField
            label="Minimum OCR confidence (%)"
            value={node.confidence}
            max={100}
            onChange={(confidence) => patch({ confidence })}
          />
          <button className="debug-text wide" disabled={debuggingText} onClick={onDebugText}>
            {debuggingText ? 'Running OCR…' : 'Debug detection now'}
          </button>
          {textDebug && (
            <div className={`text-debug-result ${textDebug.passed ? 'passed' : 'failed'}`}>
              <div>
                <strong>{textDebug.passed ? 'Passed' : 'Failed'}</strong>
                <span>{textDebug.confidence.toFixed(1)}% OCR confidence</span>
              </div>
              <p>{textDebug.reason}</p>
              <code>{textDebug.recognizedText || 'No text recognized'}</code>
            </div>
          )}
        </>
      )}
      {(node.type === 'detectColor' || node.type === 'detectText') && (
        <div className="field-grid">
          <NumberField
            label="Poll every (ms)"
            value={node.pollMs}
            min={node.type === 'detectText' ? 100 : 50}
            onChange={(pollMs) => patch({ pollMs })}
          />
          <NumberField
            label="Timeout (ms)"
            value={node.timeoutMs}
            min={node.type === 'detectText' ? 100 : 50}
            onChange={(timeoutMs) => patch({ timeoutMs })}
          />
        </div>
      )}
      {node.type === 'loop' && (
        <>
          <NumberField
            label="Number of loops"
            value={Math.max(0, node.maxIterations - 1)}
            min={0}
            max={9_999}
            onChange={(loops) => patch({ maxIterations: loops + 1 })}
          />
          <p className="field-help">
            Connect <strong>Repeat</strong> through the loop body, then return it to{' '}
            <strong>Loop back</strong>. After this many repeats, <strong>Done</strong> continues the
            workflow.
          </p>
          <NumberField
            label="Maximum duration (ms)"
            value={node.maxDurationMs}
            min={100}
            max={86_400_000}
            onChange={(maxDurationMs) => patch({ maxDurationMs })}
          />
        </>
      )}
      <button className="delete-node wide" disabled={node.type === 'start'} onClick={onDelete}>
        Delete node
      </button>
    </div>
  );
});

export function App() {
  const { workflow, setWorkflow, undo, redo, canUndo, canRedo } =
    useWorkflowHistory(defaultWorkflow);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selected, setSelected] = useState<string>('start');
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [logLevel, setLogLevel] = useState<'all' | RunLog['level']>('all');
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<string>();
  const [issue, setIssue] = useState<UiIssue>();
  const [recording, setRecording] = useState(false);
  const [recordConfirmation, setRecordConfirmation] = useState(false);
  const [textDebug, setTextDebug] = useState<TextDebugResult>();
  const [debuggingText, setDebuggingText] = useState(false);
  const [colorDebug, setColorDebug] = useState<ColorDebugResult>();
  const [debuggingColor, setDebuggingColor] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeName>('midnight');
  const [connectionMenu, setConnectionMenu] = useState<ConnectionMenuState>();
  const [selectedEdge, setSelectedEdge] = useState<string>();
  const [flow, setFlow] = useState<ReactFlowInstance<MacroFlowNode>>();
  const [currentMousePoint, setCurrentMousePoint] = useState<{ x: number; y: number }>();
  const refreshWindows = useCallback(
    () =>
      window.macroApi
        .listWindows()
        .then(setWindows)
        .catch((e: unknown) => setIssue({ title: 'Could not refresh windows', detail: String(e) })),
    [],
  );
  useEffect(() => {
    void refreshWindows();
    const offLog = window.macroApi.onLog((log) => {
      setLogs((old) => [...old.slice(-199), log]);
      if (log.level === 'error') {
        setIssue({
          title: 'Workflow stopped at a node',
          detail: log.message,
          ...(log.nodeId ? { nodeId: log.nodeId } : {}),
        });
        if (log.nodeId) setSelected(log.nodeId);
      }
    });
    const offState = window.macroApi.onState((state) => {
      setRunning(state.running);
      setActive(state.activeNodeId);
    });
    return () => {
      offLog();
      offState();
    };
  }, [refreshWindows]);
  useEffect(() => {
    setWorkflow(normalizeWorkflow);
  }, [setWorkflow]);
  useEffect(() => {
    if (!workflow.nodes.some((node) => node.id === selected)) setSelected('start');
  }, [workflow.nodes, selected]);
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState<MacroFlowNode>([]);
  const targetWindow = useMemo(
    () =>
      windows.find(
        (win) =>
          win.processName === workflow.target.processName &&
          win.title.includes(workflow.target.titlePattern),
      ),
    [windows, workflow.target.processName, workflow.target.titlePattern],
  );
  const chosen = useMemo(
    () => workflow.nodes.find((node) => node.id === selected),
    [workflow.nodes, selected],
  );
  useEffect(() => {
    setFlowNodes((current) => {
      const existingById = new Map(current.map((node) => [node.id, node]));
      return workflow.nodes.map((node) => ({
        ...existingById.get(node.id),
        id: node.id,
        type: 'macro',
        position: node.position,
        data: { label: node.label, nodeType: node.type, outcomes: outcomesFor(node.type) },
        className: `${active === node.id ? 'active-node' : ''} ${issue?.nodeId === node.id ? 'error-node' : ''}`,
        deletable: node.type !== 'start',
      }));
    });
  }, [workflow.nodes, active, issue?.nodeId, setFlowNodes]);
  const flowEdges: Edge[] = useMemo(
    () =>
      workflow.edges.map((edge) => {
        const targetHandle = loopTargetHandle(workflow, edge);
        return {
          id: edge.id,
          source: edge.source,
          sourceHandle: edge.outcome,
          target: edge.target,
          targetHandle,
          selected: selectedEdge === edge.id,
          reconnectable: true,
          type: 'step',
          zIndex: 5,
          interactionWidth: 24,
          style: { stroke: '#7f8ca8', strokeWidth: 2.4 },
        };
      }),
    [workflow, selectedEdge],
  );
  const nodeSignature = useMemo(
    () => workflow.nodes.map((node) => node.id).join('|'),
    [workflow.nodes],
  );
  useEffect(() => {
    if (!flow || !nodeSignature) return;
    const frame = requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: 250 }));
    return () => cancelAnimationFrame(frame);
  }, [flow, nodeSignature]);
  const layoutNodes = useCallback(() => {
    setWorkflow((w) => {
      const start = w.nodes.find((node) => node.type === 'start');
      if (!start) return w;
      const depths = new Map<string, number>([[start.id, 0]]);
      const queue = [start.id];
      while (queue.length) {
        const source = queue.shift()!;
        const depth = depths.get(source)!;
        for (const edge of w.edges.filter(
          (candidate) =>
            candidate.source === source && loopTargetHandle(w, candidate) !== 'loopBack',
        )) {
          if (depths.has(edge.target)) continue;
          depths.set(edge.target, depth + 1);
          queue.push(edge.target);
        }
      }
      let orphanDepth = Math.max(0, ...depths.values()) + 1;
      for (const node of w.nodes) if (!depths.has(node.id)) depths.set(node.id, orphanDepth++);
      const columns = new Map<number, WorkflowNode[]>();
      for (const node of w.nodes) {
        const depth = depths.get(node.id)!;
        columns.set(depth, [...(columns.get(depth) ?? []), node]);
      }
      const positions = new Map<string, { x: number; y: number }>();
      for (const [depth, nodes] of [...columns].sort(([a], [b]) => a - b)) {
        nodes.sort((a, b) => {
          const incomingA =
            w.edges.find((edge) => edge.target === a.id && loopTargetHandle(w, edge) !== 'loopBack')
              ?.outcome ?? 'next';
          const incomingB =
            w.edges.find((edge) => edge.target === b.id && loopTargetHandle(w, edge) !== 'loopBack')
              ?.outcome ?? 'next';
          const order: RouteOutcome[] = ['found', 'repeat', 'next', 'notFound', 'done'];
          return order.indexOf(incomingA) - order.indexOf(incomingB) || a.position.y - b.position.y;
        });
        const totalHeight = (nodes.length - 1) * 150;
        nodes.forEach((node, index) =>
          positions.set(node.id, { x: 80 + depth * 310, y: 120 + index * 150 - totalHeight / 2 }),
        );
      }
      return {
        ...w,
        nodes: w.nodes.map((node) => ({ ...node, position: positions.get(node.id)! })),
      };
    });
    window.setTimeout(() => void flow?.fitView({ padding: 0.18, duration: 450 }), 0);
  }, [flow, setWorkflow]);
  const saveNodePosition = useCallback(
    (node: MacroFlowNode) => {
      setWorkflow((w) => ({
        ...w,
        nodes: w.nodes.map((candidate) =>
          candidate.id === node.id ? { ...candidate, position: node.position } : candidate,
        ),
      }));
    },
    [setWorkflow],
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      setWorkflow((w) => {
        const source = w.nodes.find((n) => n.id === connection.source);
        if (!source) return w;
        const validOutcomes = outcomesFor(source.type);
        const requested = connection.sourceHandle as RouteOutcome | null;
        const outcome =
          requested && validOutcomes.includes(requested) ? requested : validOutcomes[0];
        if (!outcome) return w;
        return {
          ...w,
          edges: [
            ...w.edges.filter(
              (edge) => !(edge.source === connection.source && edge.outcome === outcome),
            ),
            {
              id: crypto.randomUUID(),
              source: connection.source!,
              target: connection.target!,
              ...(connection.targetHandle
                ? { targetHandle: connection.targetHandle as 'entry' | 'loopBack' }
                : {}),
              outcome,
            },
          ],
        };
      });
    },
    [setWorkflow],
  );
  const reconnect = useCallback(
    (edge: Edge, connection: Connection) => {
      if (!connection.source || !connection.target) return;
      setWorkflow((w) => ({
        ...w,
        edges: w.edges.map((candidate) => {
          if (candidate.id !== edge.id) return candidate;
          const rest = { ...candidate };
          delete rest.targetHandle;
          return {
            ...rest,
            source: connection.source!,
            target: connection.target!,
            ...(connection.targetHandle
              ? { targetHandle: connection.targetHandle as 'entry' | 'loopBack' }
              : {}),
          };
        }),
      }));
    },
    [setWorkflow],
  );
  const addNode = useCallback(
    (type: WorkflowNode['type']) => {
      setWorkflow((w) => {
        const node = makeNode(type, w.nodes.length);
        const selectedNode = w.nodes.find((candidate) => candidate.id === selected);
        const nextEdge = w.edges.find(
          (edge) => edge.source === selectedNode?.id && edge.outcome === 'next',
        );
        const isLinearSource =
          selectedNode?.type === 'start' ||
          selectedNode?.type === 'action' ||
          selectedNode?.type === 'delay';
        const canSplice =
          nextEdge && isLinearSource && (node.type === 'action' || node.type === 'delay');

        if (!selectedNode || !isLinearSource) return { ...w, nodes: [...w.nodes, node] };

        node.position = {
          x: selectedNode.position.x + 250,
          y: selectedNode.position.y,
        };

        if (!nextEdge) {
          const orphanStop = w.nodes.find(
            (candidate) =>
              candidate.type === 'stop' && !w.edges.some((edge) => edge.target === candidate.id),
          );
          return {
            ...w,
            nodes: [...w.nodes, node],
            edges: [
              ...w.edges,
              {
                id: crypto.randomUUID(),
                source: selectedNode.id,
                target: node.id,
                outcome: 'next',
              },
              ...(node.type !== 'stop' && orphanStop
                ? [
                    {
                      id: crypto.randomUUID(),
                      source: node.id,
                      target: orphanStop.id,
                      outcome: 'next' as const,
                    },
                  ]
                : []),
            ],
          };
        }

        if (!canSplice) return { ...w, nodes: [...w.nodes, node] };

        return {
          ...w,
          nodes: [...w.nodes, node],
          edges: [
            ...w.edges.filter((edge) => edge.id !== nextEdge.id),
            { ...nextEdge, target: node.id },
            {
              id: crypto.randomUUID(),
              source: node.id,
              target: nextEdge.target,
              outcome: 'next',
            },
          ],
        };
      });
    },
    [selected, setWorkflow],
  );
  const deleteEdges = useCallback(
    (edges: Edge[]) => {
      const removedIds = new Set(edges.map((edge) => edge.id));
      setSelectedEdge((current) => (current && removedIds.has(current) ? undefined : current));
      setWorkflow((w) => ({
        ...w,
        edges: w.edges.filter((edge) => !removedIds.has(edge.id)),
      }));
    },
    [setWorkflow],
  );
  const deleteWorkflowNodes = useCallback(
    (nodeIds: string[]) => {
      const removedIds = new Set(nodeIds);
      if (removedIds.size === 0) return;
      setSelected((current) => (removedIds.has(current) ? 'start' : current));
      setWorkflow((w) => ({
        ...w,
        nodes: w.nodes.filter((node) => !removedIds.has(node.id)),
        edges: w.edges.filter(
          (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
        ),
      }));
    },
    [setWorkflow],
  );
  const updateSelectedNode = useCallback(
    (updated: WorkflowNode) => {
      setWorkflow((w) => ({
        ...w,
        nodes: w.nodes.map((node) => (node.id === updated.id ? updated : node)),
      }));
      if (updated.type === 'detectText') setTextDebug(undefined);
      setIssue((current) => (current?.nodeId === updated.id ? undefined : current));
    },
    [setWorkflow],
  );
  const chooseTarget = (id: string) => {
    const win = windows.find((w) => w.id === Number(id));
    if (win)
      setWorkflow((w) => ({
        ...w,
        target: { processName: win.processName, titlePattern: win.title },
      }));
  };
  const run = useCallback(async () => {
    try {
      const runnableWorkflow = repairEmptyStarterGraph(workflow);
      workflowSchema.parse(runnableWorkflow);
      setWorkflow(runnableWorkflow);
      setIssue(undefined);
      setLogs([]);
      await window.macroApi.run(runnableWorkflow);
    } catch (e) {
      const nextIssue = issueFrom(e, workflow, 'Could not run workflow');
      setIssue((current) => (current?.nodeId ? current : nextIssue));
      if (nextIssue.nodeId) setSelected(nextIssue.nodeId);
    }
  }, [workflow, setWorkflow]);
  const save = useCallback(async () => {
    try {
      workflowSchema.parse(workflow);
      await window.macroApi.saveWorkflow(workflow);
      setIssue(undefined);
    } catch (e) {
      const nextIssue = issueFrom(e, workflow, 'Could not save workflow');
      setIssue(nextIssue);
      if (nextIssue.nodeId) setSelected(nextIssue.nodeId);
    }
  }, [workflow]);
  const load = useCallback(async () => {
    try {
      const result = await window.macroApi.loadWorkflow();
      if (result.workflow) setWorkflow(normalizeWorkflow(result.workflow));
      setIssue(undefined);
    } catch (e) {
      setIssue(issueFrom(e, workflow, 'Could not open workflow'));
    }
  }, [setWorkflow, workflow]);
  const toggleRecord = useCallback(
    async (confirmed = false) => {
      try {
        if (!recording) {
          if (!targetWindow) throw new Error('Select an available target window');
          if (workflow.nodes.some((node) => node.type !== 'start') && !confirmed) {
            setRecordConfirmation(true);
            return;
          }
          const start = workflow.nodes.find((node) => node.type === 'start');
          if (!start) throw new Error('The workflow has no Start node');
          await window.macroApi.startRecording(targetWindow.id);
          setRecordConfirmation(false);
          setWorkflow((current) => ({ ...current, nodes: [start], edges: [] }));
          setSelected(start.id);
          setIssue(undefined);
          setRecording(true);
        } else {
          const nodes = await window.macroApi.stopRecording();
          setWorkflow((w) => {
            const start = w.nodes.find((node) => node.type === 'start');
            if (!start || nodes.length === 0) return w;
            const positioned = nodes.map((node, index) => ({
              ...node,
              position: { x: start.position.x + (index + 1) * 270, y: start.position.y },
            }));
            const chain = [start, ...positioned];
            return {
              ...w,
              nodes: chain,
              edges: chain.slice(0, -1).map((node, index) => ({
                id: crypto.randomUUID(),
                source: node.id,
                target: chain[index + 1]!.id,
                outcome: 'next',
              })),
            };
          });
          setRecording(false);
        }
      } catch (e) {
        setIssue(
          issueFrom(
            e,
            workflow,
            recording ? 'Could not finish recording' : 'Could not start recording',
          ),
        );
      }
    },
    [recording, setWorkflow, targetWindow, workflow],
  );
  useEffect(() => {
    if (!targetWindow || chosen?.type !== 'action') return;
    window.macroApi
      .getRelativeCursorPosition(targetWindow.id)
      .then((point) => point && setCurrentMousePoint(point))
      .catch(() => undefined);
  }, [chosen?.id, chosen?.type, targetWindow]);
  const pick = useCallback(async () => {
    try {
      if (!targetWindow) throw new Error('Select an available target window');
      const result =
        chosen?.type === 'detectColor' && chosen.region.relativeTo === 'screen'
          ? await window.macroApi.pickScreenRegion(targetWindow.id)
          : await window.macroApi.pickRegion(targetWindow.id);
      if (!result || !chosen || (chosen.type !== 'detectColor' && chosen.type !== 'detectText'))
        return;
      setWorkflow((w) => ({
        ...w,
        nodes: w.nodes.map((n) =>
          n.id !== chosen.id
            ? n
            : n.type === 'detectColor'
              ? {
                  ...n,
                  region: {
                    x: result.x,
                    y: result.y,
                    width: result.width,
                    height: result.height,
                    relativeTo: result.relativeTo,
                  },
                  color: result.color,
                }
              : n.type === 'detectText'
                ? {
                    ...n,
                    region: {
                      x: result.x,
                      y: result.y,
                      width: result.width,
                      height: result.height,
                    },
                  }
                : n,
        ),
      }));
    } catch (e) {
      setIssue(issueFrom(e, workflow, 'Could not pick region'));
    }
  }, [chosen, setWorkflow, targetWindow, workflow]);
  const pickPoint = useCallback(
    async (key: 'point' | 'endPoint') => {
      try {
        if (!targetWindow) throw new Error('Select an available target window first');
        if (!chosen || chosen.type !== 'action') return;
        const point = await window.macroApi.pickPoint(targetWindow.id);
        if (point) updateSelectedNode({ ...chosen, [key]: point });
      } catch (e) {
        setIssue(issueFrom(e, workflow, 'Could not pick location'));
      }
    },
    [chosen, targetWindow, updateSelectedNode, workflow],
  );
  const debugTextDetection = useCallback(async () => {
    try {
      if (!targetWindow) throw new Error('Select an available target window first');
      if (!chosen || chosen.type !== 'detectText') return;
      setDebuggingText(true);
      setTextDebug(
        await window.macroApi.debugText(
          targetWindow.id,
          chosen.region,
          chosen.text,
          chosen.confidence,
        ),
      );
      setIssue(undefined);
    } catch (e) {
      setIssue(issueFrom(e, workflow, 'Could not debug text detection'));
    } finally {
      setDebuggingText(false);
    }
  }, [chosen, targetWindow, workflow]);
  const debugColorDetection = useCallback(async () => {
    try {
      if (!targetWindow) throw new Error('Select an available target window first');
      if (!chosen || chosen.type !== 'detectColor') return;
      setDebuggingColor(true);
      setColorDebug(
        await window.macroApi.debugColor(
          targetWindow.id,
          chosen.region,
          chosen.color,
          chosen.tolerance,
        ),
      );
      setIssue(undefined);
    } catch (e) {
      setIssue(issueFrom(e, workflow, 'Could not debug color detection'));
    } finally {
      setDebuggingColor(false);
    }
  }, [chosen, targetWindow, workflow]);
  const createConnectedNode = useCallback(
    (type: WorkflowNode['type']) => {
      if (!connectionMenu) return;
      const node = makeNode(type, workflow.nodes.length);
      node.position = connectionMenu.flowPosition;
      setWorkflow((current) => ({
        ...current,
        nodes: [...current.nodes, node],
        edges: [
          ...current.edges.filter(
            (edge) =>
              !(edge.source === connectionMenu.source && edge.outcome === connectionMenu.outcome),
          ),
          {
            id: crypto.randomUUID(),
            source: connectionMenu.source,
            target: node.id,
            outcome: connectionMenu.outcome,
          },
        ],
      }));
      setSelected(node.id);
      setConnectionMenu(undefined);
    },
    [connectionMenu, setWorkflow, workflow.nodes.length],
  );
  const openLogFile = useCallback(async () => {
    try {
      await window.macroApi.openLog(logs);
    } catch (error) {
      setIssue(issueFrom(error, workflow, 'Could not open log file'));
    }
  }, [logs, workflow]);
  const errorLogCount = useMemo(() => logs.filter((log) => log.level === 'error').length, [logs]);
  const visibleLogs = useMemo(
    () => logs.filter((log) => logLevel === 'all' || log.level === logLevel),
    [logs, logLevel],
  );
  const handleInspectorRecord = useCallback(() => {
    void toggleRecord();
  }, [toggleRecord]);
  const handleInspectorPick = useCallback(() => {
    void pick();
  }, [pick]);
  const handleInspectorDebugText = useCallback(() => {
    void debugTextDetection();
  }, [debugTextDetection]);
  const handleInspectorDebugColor = useCallback(() => {
    void debugColorDetection();
  }, [debugColorDetection]);
  const handleInspectorDelete = useCallback(() => {
    if (!chosen) return;
    deleteWorkflowNodes([chosen.id]);
  }, [chosen, deleteWorkflowNodes]);
  const handlePickPoint = useCallback(
    (key: 'point' | 'endPoint') => {
      void pickPoint(key);
    },
    [pickPoint],
  );
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      } else if (command && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void load();
      } else if (
        command &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z' &&
        !running &&
        !recording
      ) {
        event.preventDefault();
        undo();
      } else if (
        command &&
        (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z')) &&
        !running &&
        !recording
      ) {
        event.preventDefault();
        redo();
      } else if (command && event.key === 'Enter' && !running) {
        event.preventDefault();
        void run();
      } else if (event.key === 'Escape' && running) {
        event.preventDefault();
        void window.macroApi.stop();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [load, recording, redo, run, running, save, undo]);
  return (
    <div className={`app theme-${theme} ${logsExpanded ? 'logs-expanded' : ''}`}>
      <header>
        <div className="brand-mark">
          <img src={appIcon} alt="" />
        </div>
        <div className="brand">
          <h1>Macro Bot</h1>
          <span>Workflow Studio</span>
        </div>
        <input
          value={workflow.name}
          onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
        />
        <select value={targetWindow?.id ?? ''} onChange={(e) => chooseTarget(e.target.value)}>
          <option value="">Select target window</option>
          {windows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.processName} - {w.title}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          title="Refresh target windows"
          onClick={() => void refreshWindows()}
        >
          <Icon name="refresh" />
        </button>
        <button title="Open workflow (Ctrl+O)" onClick={() => void load()}>
          Open
        </button>
        <button title="Save workflow (Ctrl+S)" onClick={() => void save()}>
          Save
        </button>
        <button
          className="icon-button"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo || running || recording}
          onClick={undo}
        >
          <Icon name="undo" />
        </button>
        <button
          className="icon-button"
          title="Redo (Ctrl+Y)"
          disabled={!canRedo || running || recording}
          onClick={redo}
        >
          <Icon name="redo" />
        </button>
        <button className="run" disabled={running} onClick={() => void run()}>
          <Icon name="play" /> Play
        </button>
        <button className="danger" disabled={!running} onClick={() => void window.macroApi.stop()}>
          <Icon name="stop" /> Stop
        </button>
        <button
          className={`settings-button icon-button ${settingsOpen ? 'active' : ''}`}
          title="Workflow settings"
          aria-label="Workflow settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <Icon name="settings" />
        </button>
      </header>
      {settingsOpen && (
        <section className="settings-panel" aria-label="Workflow settings">
          <div className="settings-heading">
            <div>
              <span>WORKFLOW</span>
              <h2>Settings</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <label className="field">
            <span>Emergency stop shortcut</span>
            <ShortcutCapture
              value={workflow.safety.emergencyHotkey}
              placeholder="Focus this field, then press keys"
              onChange={(value) =>
                setWorkflow((current) => ({
                  ...current,
                  safety: { ...current.safety, emergencyHotkey: value },
                }))
              }
            />
          </label>
          <label className="field">
            <span>Application theme</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeName)}>
              <option value="midnight">Midnight</option>
              <option value="graphite">Graphite</option>
              <option value="slate">Slate</option>
              <option value="light">Professional light</option>
            </select>
          </label>
          <NumberField
            label="Countdown before play (seconds)"
            value={workflow.safety.countdownSeconds}
            min={0}
            max={30}
            onChange={(countdownSeconds) =>
              setWorkflow((current) => ({
                ...current,
                safety: { ...current.safety, countdownSeconds },
              }))
            }
          />
          <div className="shortcut-list">
            <span>Editor shortcuts</span>
            <div>
              <kbd>Ctrl+Enter</kbd>
              <em>Play</em>
            </div>
            <div>
              <kbd>Ctrl+S</kbd>
              <em>Save</em>
            </div>
            <div>
              <kbd>Ctrl+O</kbd>
              <em>Open</em>
            </div>
            <div>
              <kbd>Ctrl+Z / Ctrl+Y</kbd>
              <em>Undo / Redo</em>
            </div>
          </div>
          <p className="field-help">
            Focus the shortcut field and press the combination you want to capture.
          </p>
        </section>
      )}
      <main>
        <aside>
          <div className="panel-title">
            <div>
              <span>BUILD</span>
              <h2>Node library</h2>
            </div>
            <em>{workflow.nodes.length}</em>
          </div>
          <div className="palette">
            {palette.map((type) => (
              <button key={type} onClick={() => addNode(type)}>
                <span>+</span> {type.replace(/([A-Z])/g, ' $1')}
              </button>
            ))}
          </div>
          <ol>
            {workflow.nodes.map((node) => (
              <li
                key={node.id}
                className={`${selected === node.id ? 'selected' : ''} ${active === node.id ? 'active' : ''}`}
                onClick={() => setSelected(node.id)}
              >
                <span>{node.type}</span>
                {node.label}
              </li>
            ))}
          </ol>
        </aside>
        <section className="canvas">
          <ReactFlow<MacroFlowNode>
            nodes={flowNodes}
            edges={flowEdges}
            defaultEdgeOptions={{
              style: { stroke: '#7dd3fc', strokeWidth: 3 },
              type: 'step',
            }}
            connectionLineType={ConnectionLineType.Step}
            connectionLineStyle={{ stroke: '#fbbf24', strokeWidth: 4 }}
            nodeTypes={nodeTypes}
            onNodesChange={onFlowNodesChange}
            onNodesDelete={(nodes) => deleteWorkflowNodes(nodes.map((node) => node.id))}
            onNodeDragStop={(_, node) => saveNodePosition(node)}
            onConnect={onConnect}
            onConnectEnd={(event, state) => {
              if (state.isValid || !state.fromNode || !state.fromHandle || !flow) return;
              const outcome = state.fromHandle.id as RouteOutcome | null;
              const sourceType = (state.fromNode.data as MacroFlowNode['data']).nodeType;
              if (!outcome || !outcomesFor(sourceType).includes(outcome)) return;
              const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
              if (!pointer) return;
              setConnectionMenu({
                x: pointer.clientX,
                y: pointer.clientY,
                flowPosition: flow.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }),
                source: state.fromNode.id,
                outcome,
                query: '',
              });
            }}
            onEdgesDelete={deleteEdges}
            onEdgeClick={(_, edge) => setSelectedEdge(edge.id)}
            onEdgeDoubleClick={(_, edge) => deleteEdges([edge])}
            onPaneClick={() => {
              setSelectedEdge(undefined);
              setConnectionMenu(undefined);
            }}
            onReconnect={reconnect}
            onReconnectEnd={(_, edge, _handleType, connectionState) => {
              if (connectionState.isValid !== true) deleteEdges([edge]);
            }}
            edgesReconnectable
            deleteKeyCode={['Backspace', 'Delete']}
            onNodeClick={(_, n) => setSelected(n.id)}
            onInit={setFlow}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <MiniMap
              className="workflow-minimap"
              bgColor="#111827"
              nodeColor="#334155"
              nodeStrokeColor="#7dd3fc"
              nodeStrokeWidth={2}
              maskColor="rgba(2, 6, 23, 0.72)"
              pannable
              zoomable
            />
            <Controls />
            <Panel position="top-right" className="graph-tools">
              <button
                disabled={!selectedEdge}
                onClick={() => {
                  const edge = flowEdges.find((candidate) => candidate.id === selectedEdge);
                  if (edge) deleteEdges([edge]);
                }}
              >
                Delete connection
              </button>
              <button onClick={() => void flow?.fitView({ padding: 0.2, duration: 250 })}>
                Fit nodes
              </button>
              <button onClick={layoutNodes}>Auto layout</button>
            </Panel>
          </ReactFlow>
          {connectionMenu && (
            <div className="node-search" style={{ left: connectionMenu.x, top: connectionMenu.y }}>
              <div className="node-search-title">
                <span>Add connected node</span>
                <kbd>Esc</kbd>
              </div>
              <input
                autoFocus
                placeholder="Search nodes..."
                value={connectionMenu.query}
                onChange={(event) =>
                  setConnectionMenu({ ...connectionMenu, query: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setConnectionMenu(undefined);
                  if (event.key === 'Enter') {
                    const match = palette.find((type) =>
                      type.toLowerCase().includes(connectionMenu.query.toLowerCase()),
                    );
                    if (match) createConnectedNode(match);
                  }
                }}
              />
              <div className="node-search-results">
                {palette
                  .filter((type) => type.toLowerCase().includes(connectionMenu.query.toLowerCase()))
                  .map((type) => (
                    <button key={type} onClick={() => createConnectedNode(type)}>
                      <span className={`search-node-icon node-${type}`}>
                        {type[0]!.toUpperCase()}
                      </span>
                      <span>
                        <strong>{type.replace(/([A-Z])/g, ' $1')}</strong>
                        <small>Connect to {routeLabels[connectionMenu.outcome]}</small>
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </section>
        <aside className="inspector">
          <div className="panel-title">
            <div>
              <span>CONFIGURE</span>
              <h2>Node inspector</h2>
            </div>
          </div>
          {chosen ? (
            <NodeInspector
              node={chosen}
              onChange={updateSelectedNode}
              onPick={handleInspectorPick}
              onPickPoint={handlePickPoint}
              onDebugText={handleInspectorDebugText}
              onDebugColor={handleInspectorDebugColor}
              textDebug={chosen.type === 'detectText' ? textDebug : undefined}
              colorDebug={chosen.type === 'detectColor' ? colorDebug : undefined}
              debuggingText={debuggingText}
              debuggingColor={debuggingColor}
              canRecord={
                chosen.type === 'start' && !workflow.edges.some((edge) => edge.source === chosen.id)
              }
              hasExistingNodes={workflow.nodes.some((node) => node.type !== 'start')}
              recording={recording}
              onRecord={handleInspectorRecord}
              onDelete={handleInspectorDelete}
              currentMousePoint={currentMousePoint}
            />
          ) : (
            <p>Select a node.</p>
          )}
        </aside>
      </main>
      {issue && (
        <div className="issue-card" role="alert">
          <div className="issue-icon">!</div>
          <div>
            <strong>{issue.title}</strong>
            <p>{issue.detail}</p>
            {issue.nodeId && (
              <button
                onClick={() => {
                  setSelected(issue.nodeId!);
                  setIssue(undefined);
                  void flow?.fitView({
                    nodes: [{ id: issue.nodeId! }],
                    padding: 1.2,
                    duration: 350,
                  });
                }}
              >
                Show problem node
              </button>
            )}
          </div>
          <button
            className="issue-close"
            aria-label="Dismiss error"
            onClick={() => setIssue(undefined)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {recordConfirmation && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-confirm-title"
          >
            <div className="confirm-dialog-icon">!</div>
            <div>
              <h2 id="record-confirm-title">Replace the current workflow?</h2>
              <p>
                Recording will permanently delete every node except Start before capturing new
                actions.
              </p>
            </div>
            <div className="confirm-dialog-actions">
              <button onClick={() => setRecordConfirmation(false)}>Cancel</button>
              <button className="danger" onClick={() => void toggleRecord(true)}>
                Delete nodes and record
              </button>
            </div>
          </div>
        </div>
      )}
      <footer>
        <div className="log-toolbar">
          <div className="log-status">
            <i className={running ? 'running' : ''} />
            <strong>{running ? `Running: ${active ?? 'countdown'}` : 'Idle'}</strong>
            <span>{logs.length} events</span>
          </div>
          <div className="log-tabs">
            {(['all', 'info', 'error'] as const).map((level) => (
              <button
                key={level}
                className={logLevel === level ? 'active' : ''}
                onClick={() => setLogLevel(level)}
              >
                {level === 'all' ? 'All' : level === 'info' ? 'Activity' : 'Errors'}
                {level === 'error' && errorLogCount > 0 ? <em>{errorLogCount}</em> : null}
              </button>
            ))}
          </div>
          <div className="log-actions">
            <button disabled={logs.length === 0} onClick={() => void openLogFile()}>
              Open log file
            </button>
            <button disabled={logs.length === 0} onClick={() => setLogs([])}>
              Clear
            </button>
            <button onClick={() => setLogsExpanded((value) => !value)}>
              {logsExpanded ? 'Minimize' : 'Maximize'}
            </button>
          </div>
        </div>
        <div className="logs">
          {visibleLogs.length === 0 ? (
            <div className="logs-empty">
              No {logLevel === 'all' ? '' : logLevel} log entries yet.
            </div>
          ) : (
            visibleLogs.map((log, i) => (
              <div key={`${log.timestamp}-${i}`} className={`log-entry ${log.level}`}>
                <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
                <span className="log-level">{log.level}</span>
                <span className="log-message">{log.message}</span>
                {log.nodeId && (
                  <button
                    onClick={() => {
                      setSelected(log.nodeId!);
                      void flow?.fitView({
                        nodes: [{ id: log.nodeId! }],
                        padding: 1.2,
                        duration: 300,
                      });
                    }}
                  >
                    Show node
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}
