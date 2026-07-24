import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

interface StreamConfig {
    host: string;
    port: string;
    password: string;
    mount: string;
    icecastUser: string;
    bitrate: string;
    inputGain: string;
    inputDeviceName: string;
    recordLocal: boolean;
}

contextBridge.exposeInMainWorld('electronAPI', {
    startStream: (config: StreamConfig) => ipcRenderer.invoke('start-stream', config),
    stopStream: () => ipcRenderer.invoke('stop-stream'),
    getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
    onStreamStatus: (callback: (status: string, message?: string) => void) => {
        const handler = (_event: IpcRendererEvent, status: string, message?: string) => callback(status, message);
        ipcRenderer.on('STREAM_STATUS', handler);
        return () => { ipcRenderer.removeListener('STREAM_STATUS', handler); };
    },
    onLogEvent: (callback: (e: { level: 'info' | 'success' | 'error'; source: 'stream' | 'metadata' | 'system'; message: string }) => void) => {
        const handler = (_event: IpcRendererEvent, e: { level: 'info' | 'success' | 'error'; source: 'stream' | 'metadata' | 'system'; message: string }) => callback(e);
        ipcRenderer.on('LOG_EVENT', handler);
        return () => { ipcRenderer.removeListener('LOG_EVENT', handler); };
    },
    updateMetadata: (meta: { artist: string; title: string }) =>
        ipcRenderer.invoke('update-metadata', meta),
    setInputGain: (pct: number) => ipcRenderer.invoke('set-input-gain', pct),
    saveDjPassword: (args: { username: string; password: string }) =>
        ipcRenderer.invoke('dj-password-save', args),
    loadDjPassword: (args: { username: string }) =>
        ipcRenderer.invoke('dj-password-load', args),
    deleteDjPassword: (args: { username: string }) =>
        ipcRenderer.invoke('dj-password-delete', args),
});
