/** Versione app iniettata da Vite (define __APP_VERSION__ ← package.json) */
declare const __APP_VERSION__: string;
/** Nome dell'edizione (package.json → streamflowEdition), accanto alla versione */
declare const __APP_EDITION__: string;

type UpdateStatus =
    | { state: 'idle' }
    | { state: 'downloading'; version: string }
    | { state: 'ready'; version: string };

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
        mixMode: boolean;
    }) => Promise<void>;
    stopStream: () => Promise<void>;
    onStreamStatus: (
        callback: (status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting', message?: string) => void
    ) => () => void;
    getStreamStatus: () => Promise<{
        status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';
        message?: string;
    }>;
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
    sendMixAudio: (pcm: Uint8Array) => void;
    saveDjPassword: (args: { username: string; password: string }) => Promise<{ ok: boolean }>;
    loadDjPassword: (args: { username: string }) => Promise<{ password: string | null }>;
    deleteDjPassword: (args: { username: string }) => Promise<void>;
    openLogFolder: () => Promise<{ ok: boolean; dir: string | null }>;
    writeLog: (level: 'info' | 'success' | 'error', message: string) => void;
    onWindowMinimized: (callback: (minimized: boolean) => void) => () => void;
    getUpdateStatus: () => Promise<UpdateStatus>;
    onUpdateStatus: (callback: (s: UpdateStatus) => void) => () => void;
    installUpdate: () => Promise<{ ok: boolean; message?: string }>;
    runConnectionTest: (config: {
        host: string;
        port: string;
        mount: string;
        icecastUser: string;
        password: string;
        bitrate: string;
    }) => Promise<{ ok: boolean; summary: string }>;
}

interface Window {
    electronAPI: ElectronAPI;
}
