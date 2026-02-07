const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startStream: (config: any) => ipcRenderer.invoke('start-stream', config),
    stopStream: () => ipcRenderer.invoke('stop-stream'),
    onStreamStatus: (callback: (status: string, message?: string) => void) => {
        ipcRenderer.on('STREAM_STATUS', (_event: any, status: string, message?: string) => callback(status, message));
    }
});
