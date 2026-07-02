import { useCallback, useEffect, useState } from 'react';
import {
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  MiniMap,
  MarkerType,
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
import {
  defaultWorkflow,
  workflowSchema,
  type RunLog,
  type WindowInfo,
  type Workflow,
  type WorkflowNode,
} from '../shared/workflow';

const palette: WorkflowNode['type'][] = [
  'action',
  'delay',
  'detectColor',
  'detectText',
  'branch',
  'loop',
  'stop',
];

type MacroFlowNode = Node<{ label: string; nodeType: WorkflowNode['type'] }, 'macro'>;

function MacroNode({ data, selected }: NodeProps<MacroFlowNode>) {
  return (
    <div className={`macro-node ${selected ? 'selected' : ''}`}>
      {data.nodeType !== 'start' && <Handle type="target" position={Position.Left} />}
      <span className="macro-node-type">{data.nodeType}</span>
      <strong>{data.label}</strong>
      {data.nodeType !== 'stop' && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

const nodeTypes: NodeTypes = { macro: MacroNode };

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
        region: { x: 0, y: 0, width: 100, height: 100 },
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
    case 'branch':
      return { ...base, type, expression: 'lastDetectionFound' };
    case 'loop':
      return { ...base, type, maxIterations: 10, maxDurationMs: 60_000 };
    case 'stop':
      return { ...base, type };
    case 'start':
      return { ...base, type };
  }
}

export function App() {
  const [workflow, setWorkflow] = useState<Workflow>(defaultWorkflow);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selected, setSelected] = useState<string>('start');
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<string>();
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<string>();
  const [flow, setFlow] = useState<ReactFlowInstance<MacroFlowNode>>();
  const refreshWindows = useCallback(
    () =>
      window.macroApi
        .listWindows()
        .then(setWindows)
        .catch((e: unknown) => setError(String(e))),
    [],
  );
  useEffect(() => {
    void refreshWindows();
    const offLog = window.macroApi.onLog((log) => setLogs((old) => [...old.slice(-199), log]));
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
    setWorkflow(repairEmptyStarterGraph);
  }, []);
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState<MacroFlowNode>([]);
  useEffect(() => {
    setFlowNodes((current) => {
      const existingById = new Map(current.map((node) => [node.id, node]));
      return workflow.nodes.map((node) => ({
        ...existingById.get(node.id),
        id: node.id,
        type: 'macro',
        position: node.position,
        data: { label: node.label, nodeType: node.type },
        className: active === node.id ? 'active-node' : '',
        deletable: node.type !== 'start',
      }));
    });
  }, [workflow.nodes, active, setFlowNodes]);
  const flowEdges: Edge[] = workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.outcome,
    selected: selectedEdge === edge.id,
    reconnectable: true,
    type: 'smoothstep',
    zIndex: 5,
    interactionWidth: 24,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#38bdf8',
      width: 22,
      height: 22,
    },
    style: {
      stroke: '#38bdf8',
      strokeWidth: 4,
    },
    labelStyle: {
      fill: '#e0f2fe',
      fontWeight: 700,
    },
    labelBgStyle: {
      fill: '#0f172a',
      fillOpacity: 0.9,
    },
  }));
  const nodeSignature = workflow.nodes.map((node) => node.id).join('|');
  useEffect(() => {
    if (!flow || !nodeSignature) return;
    const frame = requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: 250 }));
    return () => cancelAnimationFrame(frame);
  }, [flow, nodeSignature]);
  const layoutNodes = () => {
    setWorkflow((w) => ({
      ...w,
      nodes: w.nodes.map((node, index) => ({
        ...node,
        position: { x: 100 + (index % 3) * 260, y: 80 + Math.floor(index / 3) * 120 },
      })),
    }));
    window.setTimeout(() => void flow?.fitView({ padding: 0.2, duration: 250 }), 0);
  };
  const saveNodePosition = (node: MacroFlowNode) => {
    setWorkflow((w) => ({
      ...w,
      nodes: w.nodes.map((candidate) =>
        candidate.id === node.id ? { ...candidate, position: node.position } : candidate,
      ),
    }));
  };
  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    setWorkflow((w) => {
      const source = w.nodes.find((n) => n.id === connection.source);
      const existing = w.edges.filter((e) => e.source === connection.source);
      const choices =
        source?.type === 'detectColor' || source?.type === 'detectText'
          ? (['found', 'notFound'] as const)
          : source?.type === 'branch'
            ? (['true', 'false'] as const)
            : source?.type === 'loop'
              ? (['repeat', 'done'] as const)
              : (['next'] as const);
      const outcome =
        choices.find((choice) => !existing.some((edge) => edge.outcome === choice)) ??
        choices[choices.length - 1]!;
      return {
        ...w,
        edges: [
          ...w.edges,
          {
            id: crypto.randomUUID(),
            source: connection.source!,
            target: connection.target!,
            outcome,
          },
        ],
      };
    });
  };
  const reconnect = (edge: Edge, connection: Connection) => {
    if (!connection.source || !connection.target) return;
    setWorkflow((w) => ({
      ...w,
      edges: w.edges.map((candidate) =>
        candidate.id === edge.id
          ? { ...candidate, source: connection.source!, target: connection.target! }
          : candidate,
      ),
    }));
  };
  const addNode = (type: WorkflowNode['type']) => {
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
  };
  const deleteEdges = (edges: Edge[]) => {
    const removedIds = new Set(edges.map((edge) => edge.id));
    setSelectedEdge((current) => (current && removedIds.has(current) ? undefined : current));
    setWorkflow((w) => ({
      ...w,
      edges: w.edges.filter((edge) => !removedIds.has(edge.id)),
    }));
  };
  const deleteWorkflowNodes = (nodeIds: string[]) => {
    const removedIds = new Set(nodeIds);
    if (removedIds.size === 0) return;
    setSelected((current) => (removedIds.has(current) ? 'start' : current));
    setWorkflow((w) => ({
      ...w,
      nodes: w.nodes.filter((node) => !removedIds.has(node.id)),
      edges: w.edges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target)),
    }));
  };
  const updateNode = (value: string) => {
    try {
      const parsed = JSON.parse(value) as WorkflowNode;
      setWorkflow((w) => ({ ...w, nodes: w.nodes.map((n) => (n.id === selected ? parsed : n)) }));
      setError('');
    } catch {
      setError('Node JSON is not valid yet');
    }
  };
  const targetWindow = windows.find(
    (win) =>
      win.processName === workflow.target.processName &&
      win.title.includes(workflow.target.titlePattern),
  );
  const chooseTarget = (id: string) => {
    const win = windows.find((w) => w.id === Number(id));
    if (win)
      setWorkflow((w) => ({
        ...w,
        target: { processName: win.processName, titlePattern: win.title },
      }));
  };
  const run = async () => {
    try {
      const runnableWorkflow = repairEmptyStarterGraph(workflow);
      workflowSchema.parse(runnableWorkflow);
      setWorkflow(runnableWorkflow);
      setError('');
      setLogs([]);
      await window.macroApi.run(runnableWorkflow);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const save = async () => {
    try {
      workflowSchema.parse(workflow);
      await window.macroApi.saveWorkflow(workflow);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const load = async () => {
    try {
      const result = await window.macroApi.loadWorkflow();
      if (result.workflow) setWorkflow(repairEmptyStarterGraph(result.workflow));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleRecord = async () => {
    try {
      if (!recording) {
        if (!targetWindow) throw new Error('Select an available target window');
        await window.macroApi.startRecording(targetWindow.id);
        setRecording(true);
      } else {
        const nodes = await window.macroApi.stopRecording();
        setWorkflow((w) => {
          if (nodes.length === 0) return w;
          const selectedNode = w.nodes.find((node) => node.id === selected);
          const isLinearSource =
            selectedNode?.type === 'start' ||
            selectedNode?.type === 'action' ||
            selectedNode?.type === 'delay';
          const nextEdge = w.edges.find(
            (edge) => edge.source === selectedNode?.id && edge.outcome === 'next',
          );
          const positioned = nodes.map((node, index) => ({
            ...node,
            position: selectedNode
              ? {
                  x: selectedNode.position.x + (index + 1) * 240,
                  y: selectedNode.position.y,
                }
              : { x: 220, y: 160 + index * 70 },
          }));
          if (!selectedNode || !isLinearSource) return { ...w, nodes: [...w.nodes, ...positioned] };

          const recordedEdges = positioned.slice(0, -1).map((node, index) => ({
            id: crypto.randomUUID(),
            source: node.id,
            target: positioned[index + 1]!.id,
            outcome: 'next' as const,
          }));
          const trailingEdge = nextEdge
            ? {
                id: crypto.randomUUID(),
                source: positioned[positioned.length - 1]!.id,
                target: nextEdge.target,
                outcome: 'next' as const,
              }
            : undefined;
          const adjustedNodes = nextEdge
            ? w.nodes.map((node) =>
                node.id === nextEdge.target
                  ? {
                      ...node,
                      position: {
                        x: selectedNode.position.x + (positioned.length + 1) * 240,
                        y: selectedNode.position.y,
                      },
                    }
                  : node,
              )
            : w.nodes;
          return {
            ...w,
            nodes: [...adjustedNodes, ...positioned],
            edges: [
              ...w.edges.filter((edge) => edge.id !== nextEdge?.id),
              {
                id: nextEdge?.id ?? crypto.randomUUID(),
                source: selectedNode.id,
                target: positioned[0]!.id,
                outcome: 'next',
              },
              ...recordedEdges,
              ...(trailingEdge ? [trailingEdge] : []),
            ],
          };
        });
        setRecording(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const chosen = workflow.nodes.find((n) => n.id === selected);
  const pick = async () => {
    try {
      if (!targetWindow) throw new Error('Select an available target window');
      const result = await window.macroApi.pickRegion(targetWindow.id);
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
                  region: { x: result.x, y: result.y, width: result.width, height: result.height },
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
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="app">
      <header>
        <h1>Macro Bot</h1>
        <input
          value={workflow.name}
          onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
        />
        <select value={targetWindow?.id ?? ''} onChange={(e) => chooseTarget(e.target.value)}>
          <option value="">Select target window</option>
          {windows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.processName} — {w.title}
            </option>
          ))}
        </select>
        <button onClick={() => void refreshWindows()}>Refresh</button>
        <button onClick={() => void load()}>Open</button>
        <button onClick={() => void save()}>Save</button>
        <button className={recording ? 'danger' : ''} onClick={() => void toggleRecord()}>
          {recording ? 'Stop recording' : 'Record'}
        </button>
        <button className="run" disabled={running} onClick={() => void run()}>
          Run
        </button>
        <button className="danger" disabled={!running} onClick={() => void window.macroApi.stop()}>
          Stop (F8)
        </button>
      </header>
      {error && <div className="error">{error}</div>}
      <main>
        <aside>
          <h2>Steps</h2>
          <div className="palette">
            {palette.map((type) => (
              <button key={type} onClick={() => addNode(type)}>
                + {type}
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
              type: 'smoothstep',
            }}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={{ stroke: '#fbbf24', strokeWidth: 4 }}
            nodeTypes={nodeTypes}
            onNodesChange={onFlowNodesChange}
            onNodesDelete={(nodes) => deleteWorkflowNodes(nodes.map((node) => node.id))}
            onNodeDragStop={(_, node) => saveNodePosition(node)}
            onConnect={onConnect}
            onEdgesDelete={deleteEdges}
            onEdgeClick={(_, edge) => setSelectedEdge(edge.id)}
            onEdgeDoubleClick={(_, edge) => deleteEdges([edge])}
            onPaneClick={() => setSelectedEdge(undefined)}
            onReconnect={reconnect}
            onReconnectEnd={(_, edge, _handleType, connectionState) => {
              if (connectionState.isValid !== true) deleteEdges([edge]);
            }}
            edgesReconnectable
            deleteKeyCode={['Backspace', 'Delete']}
            onNodeClick={(_, n) => setSelected(n.id)}
            onInit={setFlow}
            fitView
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
        </section>
        <aside className="inspector">
          <h2>Node inspector</h2>
          {chosen ? (
            <>
              <p>Edit the canonical node. Changes update both views.</p>
              {(chosen.type === 'detectColor' || chosen.type === 'detectText') && (
                <button onClick={() => void pick()}>Pick region</button>
              )}
              <textarea
                key={chosen.id}
                defaultValue={JSON.stringify(chosen, null, 2)}
                onBlur={(e) => updateNode(e.target.value)}
              />
              <button
                disabled={chosen.type === 'start'}
                onClick={() => deleteWorkflowNodes([chosen.id])}
              >
                Delete node
              </button>
            </>
          ) : (
            <p>Select a node.</p>
          )}
        </aside>
      </main>
      <footer>
        <strong>{running ? `Running: ${active ?? 'countdown'}` : 'Idle'}</strong>
        <div className="logs">
          {logs.map((log, i) => (
            <span key={`${log.timestamp}-${i}`} className={log.level}>
              {new Date(log.timestamp).toLocaleTimeString()} {log.message}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
