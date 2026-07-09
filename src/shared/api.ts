import type { RunLog, WindowInfo, Workflow, WorkflowNode } from './workflow';

export type MacroApi = {
  listWindows(): Promise<WindowInfo[]>;
  saveWorkflow(workflow: Workflow): Promise<{ path?: string; canceled: boolean }>;
  loadWorkflow(): Promise<{ workflow?: Workflow; path?: string; canceled: boolean }>;
  run(workflow: Workflow): Promise<void>;
  stop(): Promise<void>;
  pickRegion(windowId: number): Promise<
    | {
        x: number;
        y: number;
        width: number;
        height: number;
        color: string;
        relativeTo: 'target' | 'screen';
      }
    | undefined
  >;
  pickScreenRegion(windowId: number): Promise<
    | {
        x: number;
        y: number;
        width: number;
        height: number;
        color: string;
        relativeTo: 'target' | 'screen';
      }
    | undefined
  >;
  pickPoint(windowId: number): Promise<{ x: number; y: number } | undefined>;
  getRelativeCursorPosition(windowId: number): Promise<{ x: number; y: number } | undefined>;
  debugText(
    windowId: number,
    region: { x: number; y: number; width: number; height: number },
    expected: string,
    minimumConfidence: number,
  ): Promise<{
    passed: boolean;
    recognizedText: string;
    confidence: number;
    reason: string;
  }>;
  debugColor(
    windowId: number,
    region: {
      x: number;
      y: number;
      width: number;
      height: number;
      relativeTo?: 'target' | 'screen';
    },
    color: string,
    tolerance: number,
  ): Promise<{ passed: boolean; reason: string }>;
  startRecording(windowId: number): Promise<void>;
  stopRecording(): Promise<WorkflowNode[]>;
  openLog(logs: RunLog[]): Promise<{ path: string }>;
  onLog(callback: (log: RunLog) => void): () => void;
  onState(callback: (state: { running: boolean; activeNodeId?: string }) => void): () => void;
};
