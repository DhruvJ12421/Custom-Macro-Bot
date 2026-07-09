import { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeAcceleratorForElectron } from '../shared/accelerators';
import { colorRegionSchema, regionSchema, workflowSchema, type RunLog } from '../shared/workflow';
import { WorkflowEngine } from './engine';
import {
  focusSelectedWindow,
  getRelativeCursorPosition,
  listWindows,
} from './capabilities/windows';
import { Recorder } from './recorder';
import { pickPoint, pickRegion, pickScreenRegion, preparePicker } from './regionPicker';
import { captureRegion, containsColor, recognizeText } from './capabilities/screen';

let mainWindow: BrowserWindow | undefined;
let knownWindows = [] as ReturnType<typeof listWindows>;
const recorder = new Recorder();
const workflowsDirectory = path.join(app.getPath('userData'), 'workflows');
const windowIconPath = path.join(app.getAppPath(), 'assets', 'icon.ico');
const ensureWorkflowsDirectory = () => mkdir(workflowsDirectory, { recursive: true });
const send = (channel: string, payload: unknown) => mainWindow?.webContents.send(channel, payload);
const engine = new WorkflowEngine(
  (log: RunLog) => send('macro:log', log),
  (running, activeNodeId) =>
    send('macro:state', { running, ...(activeNodeId ? { activeNodeId } : {}) }),
);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 820,
    minHeight: 560,
    resizable: true,
    backgroundColor: '#111827',
    icon: windowIconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) void mainWindow.loadURL(dev);
  else void mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  if (mainWindow) preparePicker(mainWindow);
  globalShortcut.register('F8', () => engine.stop());
  ipcMain.handle('windows:list', () => (knownWindows = listWindows()));
  ipcMain.handle('workflow:save', async (_event, raw) => {
    const workflow = workflowSchema.parse(raw);
    await ensureWorkflowsDirectory();
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'Macro workflow', extensions: ['json'] }],
      defaultPath: path.join(workflowsDirectory, `${workflow.name}.json`),
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await writeFile(result.filePath, JSON.stringify(workflow, null, 2), 'utf8');
    return { canceled: false, path: result.filePath };
  });
  ipcMain.handle('workflow:load', async () => {
    await ensureWorkflowsDirectory();
    const result = await dialog.showOpenDialog({
      defaultPath: workflowsDirectory,
      properties: ['openFile'],
      filters: [{ name: 'Macro workflow', extensions: ['json'] }],
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return { canceled: true };
    const workflow = workflowSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    return { canceled: false, path: file, workflow };
  });
  ipcMain.handle('macro:run', async (_event, raw) => {
    const workflow = workflowSchema.parse(raw);
    globalShortcut.unregisterAll();
    const emergencyHotkey = normalizeAcceleratorForElectron(workflow.safety.emergencyHotkey);
    if (!globalShortcut.register(emergencyHotkey, () => engine.stop()))
      throw new Error(`Could not register emergency hotkey ${workflow.safety.emergencyHotkey}`);
    try {
      await engine.run(workflow);
    } finally {
      globalShortcut.unregisterAll();
      globalShortcut.register('F8', () => engine.stop());
    }
  });
  ipcMain.handle('macro:stop', () => engine.stop());
  ipcMain.handle('record:start', async (_event, id: number) => {
    const win = knownWindows.find((item) => item.id === id);
    if (!win) throw new Error('Selected window is unavailable');
    recorder.start(await focusSelectedWindow(win));
  });
  ipcMain.handle('record:stop', () => recorder.stop(mainWindow?.getBounds()));
  ipcMain.handle('logs:open', async (_event, raw: unknown) => {
    if (!Array.isArray(raw)) throw new Error('Invalid log data');
    const logs = raw.filter(
      (entry): entry is RunLog =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as RunLog).timestamp === 'string' &&
        typeof (entry as RunLog).message === 'string' &&
        ['info', 'error'].includes((entry as RunLog).level),
    );
    const directory = path.join(app.getPath('userData'), 'logs');
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, 'latest-macro.log');
    const contents = logs
      .map(
        (entry) =>
          `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.nodeId ? ` [node:${entry.nodeId}]` : ''} ${entry.message}`,
      )
      .join('\n');
    await writeFile(file, `${contents}\n`, 'utf8');
    const openError = await shell.openPath(file);
    if (openError) throw new Error(openError);
    return { path: file };
  });
  ipcMain.handle('region:pick', async (_event, id: number) => {
    const win = knownWindows.find((item) => item.id === id);
    if (!win || !mainWindow) throw new Error('Selected window is unavailable');
    const focused = await focusSelectedWindow(win);
    return pickRegion(mainWindow, focused);
  });
  ipcMain.handle('region:pick-screen', async (_event, id: number) => {
    const win = knownWindows.find((item) => item.id === id);
    if (!win || !mainWindow) throw new Error('Selected window is unavailable');
    await focusSelectedWindow(win);
    return pickScreenRegion(mainWindow);
  });
  ipcMain.handle('point:pick', async (_event, id: number) => {
    const win = knownWindows.find((item) => item.id === id);
    if (!win || !mainWindow) throw new Error('Selected window is unavailable');
    const focused = await focusSelectedWindow(win);
    return pickPoint(mainWindow, focused);
  });
  ipcMain.handle('cursor:relative', async (_event, id: number) => {
    const win = knownWindows.find((item) => item.id === id);
    if (!win) throw new Error('Selected window is unavailable');
    const focused = await focusSelectedWindow(win);
    return getRelativeCursorPosition(focused);
  });
  ipcMain.handle(
    'text:debug',
    async (_event, id: number, region, expected: string, minimumConfidence: number) => {
      const win = listWindows().find((item) => item.id === id);
      if (!win) throw new Error('Selected window is unavailable');
      const validatedRegion = regionSchema.parse(region);
      if (typeof expected !== 'string' || expected.length === 0)
        throw new Error('Text to find cannot be empty');
      if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 100)
        throw new Error('Minimum confidence must be between 0 and 100');
      const focused = await focusSelectedWindow(win);
      const result = await recognizeText(await captureRegion(focused, validatedRegion));
      const textMatches = result.text.toLowerCase().includes(expected.toLowerCase());
      const confidenceMatches = result.confidence >= minimumConfidence;
      return {
        passed: textMatches && confidenceMatches,
        recognizedText: result.text,
        confidence: result.confidence,
        reason: !textMatches
          ? `OCR read this region at ${result.confidence.toFixed(1)}%, but the expected text was not found. The minimum applies to OCR confidence after the text matches.`
          : !confidenceMatches
            ? `Text matched, but confidence was below ${minimumConfidence}%.`
            : 'Expected text was found with sufficient confidence.',
      };
    },
  );
  ipcMain.handle(
    'color:debug',
    async (_event, id: number, region, color: string, tolerance: number) => {
      const win = listWindows().find((item) => item.id === id);
      if (!win) throw new Error('Selected window is unavailable');
      const validatedRegion = colorRegionSchema.parse(region);
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Color must be a hex value');
      if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255)
        throw new Error('Tolerance must be between 0 and 255');
      const focused =
        validatedRegion.relativeTo === 'screen' ? win : await focusSelectedWindow(win);
      const passed = containsColor(await captureRegion(focused, validatedRegion), color, tolerance);
      return {
        passed,
        reason: passed
          ? `The selected region contains ${color} within tolerance ${tolerance}.`
          : `The selected region does not contain ${color} within tolerance ${tolerance}.`,
      };
    },
  );
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  recorder.stop();
  engine.stop();
});
