import { useCallback, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';

type DebugNode = Node<{ label: string; input?: boolean; output?: boolean }, 'debug'>;

const initialNodes: DebugNode[] = [
  {
    id: 'source',
    type: 'debug',
    position: { x: 80, y: 140 },
    data: { label: 'Source', output: true },
  },
  {
    id: 'target',
    type: 'debug',
    position: { x: 500, y: 140 },
    data: { label: 'Target', input: true },
  },
];

const debugEdgeStyle = { stroke: '#ff00ff', strokeWidth: 8 };

const initialEdges: Edge[] = [
  {
    id: 'hardcoded-connector',
    source: 'source',
    target: 'target',
    type: 'straight',
    label: 'HARDCODED EDGE',
    zIndex: 20,
    style: debugEdgeStyle,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#ff00ff', width: 28, height: 28 },
  },
];

function DebugNodeView({ data }: NodeProps<DebugNode>) {
  return (
    <div className="connector-debug-node">
      {data.input && <Handle type="target" position={Position.Left} />}
      <strong>{data.label}</strong>
      {data.output && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

const debugNodeTypes: NodeTypes = { debug: DebugNodeView };

export function ConnectorDebug() {
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `manual-${crypto.randomUUID()}`,
            type: 'smoothstep',
            label: 'MANUAL EDGE',
            zIndex: 20,
            style: { stroke: '#facc15', strokeWidth: 6 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#facc15',
              width: 28,
              height: 28,
            },
          },
          current,
        ),
      ),
    [],
  );

  return (
    <main className="connector-debug-page">
      <ReactFlow
        nodes={initialNodes}
        edges={edges}
        nodeTypes={debugNodeTypes}
        onConnect={onConnect}
        fitView
      >
        <Background />
        <Controls />
        <Panel position="top-left" className="connector-debug-panel">
          <strong>Connector diagnostic</strong>
          <span>Edges in state: {edges.length}</span>
          <span>The thick magenta Source → Target line is hardcoded.</span>
          <span>Drag the right circle to the left circle to add a yellow line.</span>
          <button onClick={() => setEdges(initialEdges)}>Reset edge</button>
          <button onClick={() => setEdges([])}>Remove all edges</button>
        </Panel>
      </ReactFlow>
    </main>
  );
}
