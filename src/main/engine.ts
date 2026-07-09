import type { RunLog, Workflow, WorkflowEdge, WorkflowNode } from '../shared/workflow';
import { captureRegion, containsColor, containsText } from './capabilities/screen';
import { performAction, releaseAllInput } from './capabilities/input';
import { focusTarget, resolveTarget } from './capabilities/windows';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Execution canceled'));
      },
      { once: true },
    );
  });
export class WorkflowEngine {
  private controller: AbortController | undefined;
  constructor(
    private log: (entry: RunLog) => void,
    private state: (running: boolean, nodeId?: string) => void,
  ) {}
  get running() {
    return !!this.controller;
  }
  stop() {
    this.controller?.abort();
  }
  async run(workflow: Workflow) {
    if (this.running) throw new Error('Another workflow is already running');
    await focusTarget(workflow.target);
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const nodes = new Map(workflow.nodes.map((n) => [n.id, n]));
    const loops = new Map<string, { count: number; started: number }>();
    let node: WorkflowNode | undefined = workflow.nodes.find((n) => n.type === 'start');
    try {
      this.state(true);
      this.emit('info', `Starting in ${workflow.safety.countdownSeconds}s`);
      await sleep(workflow.safety.countdownSeconds * 1000, signal);
      while (node) {
        if (signal.aborted) throw new Error('Execution canceled');
        this.state(true, node.id);
        this.emit('info', node.label, node.id);
        let outcome: WorkflowEdge['outcome'] = 'next';
        const win = resolveTarget(workflow.target);
        if (node.type === 'stop') break;
        if (node.type === 'delay') await sleep(node.milliseconds, signal);
        if (node.type === 'action') await performAction(node, win);
        if (node.type === 'detectColor' || node.type === 'detectText') {
          outcome = (await this.detect(node, workflow, signal)) ? 'found' : 'notFound';
        }
        if (node.type === 'loop') {
          const value = loops.get(node.id) ?? { count: 0, started: Date.now() };
          value.count++;
          loops.set(node.id, value);
          outcome =
            value.count < node.maxIterations && Date.now() - value.started < node.maxDurationMs
              ? 'repeat'
              : 'done';
          if (outcome === 'done') loops.delete(node.id);
        }
        const edge = workflow.edges.find((e) => e.source === node!.id && e.outcome === outcome);
        if (!edge) throw new Error(`No '${outcome}' route from ${node.label}`);
        node = nodes.get(edge.target);
      }
      this.emit('info', 'Workflow completed');
    } catch (error) {
      this.emit('error', error instanceof Error ? error.message : String(error), node?.id);
      throw error;
    } finally {
      await releaseAllInput();
      this.controller = undefined;
      this.state(false);
    }
  }
  private async detect(
    node: Extract<WorkflowNode, { type: 'detectColor' | 'detectText' }>,
    workflow: Workflow,
    signal: AbortSignal,
  ) {
    const started = Date.now();
    while (Date.now() - started < node.timeoutMs) {
      const win = resolveTarget(workflow.target);
      const png = await captureRegion(win, node.region);
      const found =
        node.type === 'detectColor'
          ? containsColor(png, node.color, node.tolerance)
          : await containsText(png, node.text, node.confidence);
      if (found) return true;
      await sleep(node.pollMs, signal);
    }
    return false;
  }
  private emit(level: RunLog['level'], message: string, nodeId?: string) {
    this.log({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(nodeId ? { nodeId } : {}),
    });
  }
}
