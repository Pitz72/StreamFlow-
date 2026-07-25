/** Versione app iniettata da Vite (define __APP_VERSION__ ← package.json) */
declare const __APP_VERSION__: string;

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
        recordLocal: boolean;
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
    setInputGain: (pct: number) => Promise<{ appliedLive: boolean }>;
    saveDjPassword: (args: { username: string; password: string }) => Promise<{ ok: boolean }>;
    loadDjPassword: (args: { username: string }) => Promise<{ password: string | null }>;
    deleteDjPassword: (args: { username: string }) => Promise<void>;
    openLogFolder: () => Promise<{ ok: boolean; dir: string | null }>;
}

interface Window {
    electronAPI: ElectronAPI;
}
