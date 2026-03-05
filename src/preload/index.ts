import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    startStream: (config: any) => ipcRenderer.invoke('start-stream', config),
    stopStream: () => ipcRenderer.invoke('stop-stream'),
    getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
    onStreamStatus: (callback: (status: string, message?: string) => void) => {
        const handler = (_event: any, status: string, message?: string) => callback(status, message);
        ipcRenderer.on('STREAM_STATUS', handler);
        // Return cleanup function to remove this specific listener
        return () => { ipcRenderer.removeListener('STREAM_STATUS', handler); };
    }
});
