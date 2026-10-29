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
    mixMode: boolean;
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
    /** Stato corrente della sessione, per riallinearsi dopo un ricaricamento dell'interfaccia. */
    getStreamStatus: () => ipcRenderer.invoke('get-stream-status'),
    onLogEvent: (callback: (e: { level: 'info' | 'success' | 'error'; source: 'stream' | 'metadata' | 'system'; message: string }) => void) => {
        const handler = (_event: IpcRendererEvent, e: { level: 'info' | 'success' | 'error'; source: 'stream' | 'metadata' | 'system'; message: string }) => callback(e);
        ipcRenderer.on('LOG_EVENT', handler);
        return () => { ipcRenderer.removeListener('LOG_EVENT', handler); };
    },
    updateMetadata: (meta: { artist: string; title: string }) =>
        ipcRenderer.invoke('update-metadata', meta),
    setInputGain: (pct: number) => ipcRenderer.invoke('set-input-gain', pct),
    /** MIX MODE: blocco di PCM 16 bit già mixato, diretto a stdin di FFmpeg. */
    sendMixAudio: (pcm: Uint8Array) => ipcRenderer.send('mix-audio-chunk', pcm),
    saveDjPassword: (args: { username: string; password: string }) =>
        ipcRenderer.invoke('dj-password-save', args),
    loadDjPassword: (args: { username: string }) =>
        ipcRenderer.invoke('dj-password-load', args),
    deleteDjPassword: (args: { username: string }) =>
        ipcRenderer.invoke('dj-password-delete', args),
    openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
    /** Evento nato nel renderer (MIX MODE) da scrivere nel file di log. */
    writeLog: (level: 'info' | 'success' | 'error', message: string) =>
        ipcRenderer.send('renderer-log', level, message),
    /** La finestra è stata ridotta a icona (true) o ripristinata (false). */
    onWindowMinimized: (callback: (minimized: boolean) => void) => {
        const handler = (_event: IpcRendererEvent, minimized: boolean) => callback(minimized);
        ipcRenderer.on('WINDOW_MINIMIZED', handler);
        return () => { ipcRenderer.removeListener('WINDOW_MINIMIZED', handler); };
    },
    /** Aggiornamento automatico: stato corrente, avvisi dal main, installazione su richiesta. */
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
    onUpdateStatus: (callback: (s: { state: string; version?: string }) => void) => {
        const handler = (_event: IpcRendererEvent, s: { state: string; version?: string }) => callback(s);
        ipcRenderer.on('UPDATE_STATUS', handler);
        return () => { ipcRenderer.removeListener('UPDATE_STATUS', handler); };
    },
    installUpdate: () => ipcRenderer.invoke('install-update'),
    runConnectionTest: (config: {
        host: string;
        port: string;
        mount: string;
        icecastUser: string;
        password: string;
        bitrate: string;
    }) => ipcRenderer.invoke('run-connection-test', config),
});
