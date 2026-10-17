import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer gets into Electron. Mirrors the `Platform` interface in
// src/renderer/src/platform so the same UI code can run in a plain browser.
const api = {
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (args: { path?: string; suggestedName: string; data: Uint8Array }) =>
    ipcRenderer.invoke('file:save', args),
  importFiles: () => ipcRenderer.invoke('file:import'),
  exportFile: (args: { suggestedName: string; data: Uint8Array }) => ipcRenderer.invoke('file:export', args),
  svgToPdf: (args: { svg: string; widthIn: number; heightIn: number }) => ipcRenderer.invoke('export:pdf', args),
  setTitle: (title: string) => ipcRenderer.invoke('window:set-title', title),
  confirmClose: () => ipcRenderer.invoke('app:confirm-close'),
  onMenuCommand: (cb: (id: string) => void) => {
    const listener = (_: unknown, id: string) => cb(id)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
  onRequestClose: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('app:request-close', listener)
    return () => ipcRenderer.removeListener('app:request-close', listener)
  }
}

contextBridge.exposeInMainWorld('biofigNative', api)
export type NativeApi = typeof api
