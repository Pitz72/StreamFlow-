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
    updateMetadata: (meta: { artist: string; title: string }) =>
        ipcRenderer.invoke('update-metadata', meta),
    azuraCastFetchStations: (args: { url: string; apiKey: string }) =>
        ipcRenderer.invoke('azuracast-fetch-stations', args),
    azuraCastFetchStationDetail: (args: { url: string; apiKey: string; stationId: number }) =>
        ipcRenderer.invoke('azuracast-fetch-station-detail', args),
    azuraCastUploadArt: (args: { url: string; apiKey: string; stationId: number; imageBase64: string }) =>
        ipcRenderer.invoke('azuracast-upload-art', args),
});
