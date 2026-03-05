interface ElectronAPI {
    startStream: (config: {
        inputDeviceName: string;
        host: string;
        port: string;
        password: string;
        mount: string;
        icecastUser?: string;
    }) => Promise<void>;
    stopStream: () => Promise<void>;
    onStreamStatus: (
        callback: (status: 'disconnected' | 'connecting' | 'connected' | 'error', message?: string) => void
    ) => () => void;
    getAudioDevices: () => Promise<string[]>;
}

interface Window {
    electronAPI: ElectronAPI;
}
