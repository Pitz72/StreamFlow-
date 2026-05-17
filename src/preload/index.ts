import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

interface StreamConfig {
    host: string;
    port: string;
    password: string;
    mount: string;
    icecastUser: string;
    inputDeviceName: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
    startStream: (config: StreamConfig) => ipcRenderer.invoke('start-stream', config),
    stopStream: () => ipcRenderer.invoke('stop-stream'),
    getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
    onStreamStatus: (callback: (status: string, message?: string) => void) => {
        const handler = (_event: IpcRendererEvent, status: string, message?: string) => callback(status, message);
        ipcRenderer.on('STREAM_STATUS', handler);
        // Return cleanup function to remove this specific listener
        return () => { ipcRenderer.removeListener('STREAM_STATUS', handler); };
    }
});
