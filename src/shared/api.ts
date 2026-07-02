import type { RunLog, WindowInfo, Workflow, WorkflowNode } from './workflow';

export type MacroApi = {
  listWindows(): Promise<WindowInfo[]>;
  saveWorkflow(workflow: Workflow): Promise<{ path?: string; canceled: boolean }>;
  loadWorkflow(): Promise<{ workflow?: Workflow; path?: string; canceled: boolean }>;
  run(workflow: Workflow): Promise<void>;
  stop(): Promise<void>;
  pickRegion(
    windowId: number,
  ): Promise<{ x: number; y: number; width: number; height: number; color: string } | undefined>;
  startRecording(windowId: number): Promise<void>;
  stopRecording(): Promise<WorkflowNode[]>;
  onLog(callback: (log: RunLog) => void): () => void;
  onState(callback: (state: { running: boolean; activeNodeId?: string }) => void): () => void;
};
