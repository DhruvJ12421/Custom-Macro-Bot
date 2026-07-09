import { contextBridge, ipcRenderer } from 'electron';
import type { MacroApi } from '../shared/api';

const api: MacroApi = {
  listWindows: () => ipcRenderer.invoke('windows:list'),
  saveWorkflow: (workflow) => ipcRenderer.invoke('workflow:save', workflow),
  loadWorkflow: () => ipcRenderer.invoke('workflow:load'),
  run: (workflow) => ipcRenderer.invoke('macro:run', workflow),
  stop: () => ipcRenderer.invoke('macro:stop'),
  pickRegion: (windowId) => ipcRenderer.invoke('region:pick', windowId),
  pickScreenRegion: (windowId) => ipcRenderer.invoke('region:pick-screen', windowId),
  pickPoint: (windowId) => ipcRenderer.invoke('point:pick', windowId),
  getRelativeCursorPosition: (windowId) => ipcRenderer.invoke('cursor:relative', windowId),
  debugText: (windowId, region, expected, minimumConfidence) =>
    ipcRenderer.invoke('text:debug', windowId, region, expected, minimumConfidence),
  debugColor: (windowId, region, color, tolerance) =>
    ipcRenderer.invoke('color:debug', windowId, region, color, tolerance),
  startRecording: (windowId) => ipcRenderer.invoke('record:start', windowId),
  stopRecording: () => ipcRenderer.invoke('record:stop'),
  openLog: (logs) => ipcRenderer.invoke('logs:open', logs),
  onLog: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, value: Parameters<typeof callback>[0]) =>
      callback(value);
    ipcRenderer.on('macro:log', listener);
    return () => ipcRenderer.removeListener('macro:log', listener);
  },
  onState: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, value: Parameters<typeof callback>[0]) =>
      callback(value);
    ipcRenderer.on('macro:state', listener);
    return () => ipcRenderer.removeListener('macro:state', listener);
  },
};
contextBridge.exposeInMainWorld('macroApi', api);
