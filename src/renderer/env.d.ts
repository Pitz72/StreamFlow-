interface AzStation {
    id: number;
    name: string;
}

interface AzStreamer {
    id: number;
    username: string;
    displayName: string;
}

interface AzStationDetail {
    host: string;
    port: string;
    mount: string;
    streamers: AzStreamer[];
    harborInferred: boolean;
}

interface ElectronAPI {
    startStream: (config: {
        inputDeviceName: string;
        host: string;
        port: string;
        password: string;
        mount: string;
        icecastUser: string;
        bitrate: string;
        inputGain: string;
    }) => Promise<void>;
    stopStream: () => Promise<void>;
    onStreamStatus: (
        callback: (status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting', message?: string) => void
    ) => () => void;
    onLogEvent: (
        callback: (e: { level: 'info' | 'success' | 'error'; source: 'stream' | 'metadata' | 'system'; message: string }) => void
    ) => () => void;
    getAudioDevices: () => Promise<string[]>;
    updateMetadata: (meta: { artist: string; title: string }) => Promise<{
        ok: boolean;
        error?: string;
        httpStatus?: number;
        requestLine?: string;
        rawResponse?: string;
    }>;
    azuraCastFetchStations: (args: { url: string; apiKey: string }) => Promise<{ ok: boolean; stations?: AzStation[]; error?: string }>;
    azuraCastFetchStationDetail: (args: { url: string; apiKey: string; stationId: number }) => Promise<{ ok: boolean; detail?: AzStationDetail; error?: string }>;
}

interface Window {
    electronAPI: ElectronAPI;
}
