import { app, BrowserWindow, dialog, globalShortcut, ipcMain } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { workflowSchema, type RunLog } from '../shared/workflow';
import { WorkflowEngine } from './engine';
import { listWindows } from './capabilities/windows';
import { Recorder } from './recorder';
import { pickRegion } from './regionPicker';

let mainWindow: BrowserWindow | undefined;
const recorder = new Recorder();
const workflowsDirectory = path.join(app.getAppPath(), 'workflows');
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
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#111827',
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
  globalShortcut.register('F8', () => engine.stop());
  ipcMain.handle('windows:list', () => listWindows());
  ipcMain.handle('workflow:save', async (_event, raw) => {
    const workflow = workflowSchema.parse(raw);
    await ensureWorkflowsDirectory();
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'Macro workflow', extensions: ['json'] }],
      defaultPath: path.join(workflowsDirectory, `${workflow.name}.macro.json`),
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
    if (!globalShortcut.register(workflow.safety.emergencyHotkey, () => engine.stop()))
      throw new Error(`Could not register emergency hotkey ${workflow.safety.emergencyHotkey}`);
    try {
      await engine.run(workflow);
    } finally {
      globalShortcut.unregisterAll();
      globalShortcut.register('F8', () => engine.stop());
    }
  });
  ipcMain.handle('macro:stop', () => engine.stop());
  ipcMain.handle('record:start', (_event, id: number) => {
    const win = listWindows().find((item) => item.id === id);
    if (!win) throw new Error('Selected window is unavailable');
    recorder.start(win);
  });
  ipcMain.handle('record:stop', () => recorder.stop());
  ipcMain.handle('region:pick', async (_event, id: number) => {
    const win = listWindows().find((item) => item.id === id);
    if (!win || !mainWindow) throw new Error('Selected window is unavailable');
    return pickRegion(mainWindow, win);
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  recorder.stop();
  engine.stop();
});
