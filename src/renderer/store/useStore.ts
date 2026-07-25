import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STATION_PRESET } from '../config/stationPreset';

interface StreamMetadata {
    artist: string;
    title: string;
}

interface StreamConfig {
    host: string;
    port: string;
    password: string;
    mount: string;
    icecastUser: string;
    bitrate: string;
    /** Guadagno input come percentuale ("100" = 100%, range 0-200). Passato a FFmpeg come -af volume=N. */
    inputGain: string;
}

export interface LogEvent {
    id: number;
    ts: number;
    level: 'info' | 'success' | 'error';
    source: 'stream' | 'metadata' | 'system';
    message: string;
}

interface AppState {
    selectedDeviceId: string;
    selectedDeviceLabel: string;
    setSelectedDeviceId: (id: string) => void;
    setSelectedDeviceLabel: (label: string) => void;
    streamConfig: StreamConfig;
    setStreamConfig: (config: Partial<StreamConfig>) => void;
    // "Ricorda password su questo computer" (cifrata via safeStorage nel main)
    rememberPassword: boolean;
    setRememberPassword: (remember: boolean) => void;
    // C2: registra la diretta anche su file MP3 locale (Documenti/StreamFlow)
    recordLocal: boolean;
    setRecordLocal: (record: boolean) => void;
    // MIX MODE: microfono + audio di sistema mixati dentro StreamFlow, per chi
    // non ha un mixer. Si sceglie PRIMA di andare in onda (cambia la sorgente
    // di FFmpeg), quindi il pannello lo blocca durante la diretta.
    mixMode: boolean;
    setMixMode: (mix: boolean) => void;
    /** Volume della musica (audio di sistema) in MIX MODE, percentuale 0-200. */
    musicGain: string;
    setMusicGain: (pct: string) => void;
    /** Runtime: true se dall'audio di sistema sta arrivando davvero qualcosa. */
    musicDetected: boolean;
    setMusicDetected: (detected: boolean) => void;
    // Now Playing metadata
    streamMetadata: StreamMetadata;
    setStreamMetadata: (meta: Partial<StreamMetadata>) => void;
    // Runtime State
    isStreaming: boolean;
    streamStatus: 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';
    setIsStreaming: (isStreaming: boolean) => void;
    setStreamStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting') => void;
    // Error notification (non-blocking toast)
    errorMessage: string | null;
    setErrorMessage: (message: string | null) => void;
    // Event log (rolling buffer, last 50 events)
    logEvents: LogEvent[];
    appendLog: (e: Omit<LogEvent, 'id' | 'ts'>) => void;
    clearLog: () => void;
}

/** Config di partenza: parametri di connessione SEMPRE dal preset Runtime Radio. */
const presetStreamConfig = (): StreamConfig => ({
    host: STATION_PRESET.host,
    port: STATION_PRESET.port,
    mount: STATION_PRESET.mount,
    bitrate: STATION_PRESET.bitrate,
    icecastUser: STATION_PRESET.djs[0]?.username ?? '',
    password: '',
    inputGain: '100',
});

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            selectedDeviceId: 'default',
            selectedDeviceLabel: 'default',
            setSelectedDeviceId: (id) => set({ selectedDeviceId: id }),
            setSelectedDeviceLabel: (label) => set({ selectedDeviceLabel: label }),
            streamConfig: presetStreamConfig(),
            setStreamConfig: (config) => set((state) => ({
                streamConfig: { ...state.streamConfig, ...config }
            })),
            rememberPassword: true,
            setRememberPassword: (remember) => set({ rememberPassword: remember }),
            recordLocal: false,
            setRecordLocal: (record) => set({ recordLocal: record }),
            mixMode: false,
            setMixMode: (mix) => set({ mixMode: mix }),
            musicGain: '100',
            setMusicGain: (pct) => set({ musicGain: pct }),
            musicDetected: false,
            setMusicDetected: (detected) => set({ musicDetected: detected }),
            // Now Playing metadata
            streamMetadata: { artist: '', title: '' },
            setStreamMetadata: (meta) => set((state) => ({
                streamMetadata: { ...state.streamMetadata, ...meta }
            })),
            // Initial Runtime State
            isStreaming: false,
            streamStatus: 'disconnected',
            setIsStreaming: (isStreaming) => set({ isStreaming }),
            setStreamStatus: (status) => set({ streamStatus: status }),
            // Error notification
            errorMessage: null,
            setErrorMessage: (message) => set({ errorMessage: message }),
            // Event log
            logEvents: [],
            appendLog: (e) => set((state) => {
                const entry: LogEvent = {
                    id: Date.now() + Math.random(),
                    ts: Date.now(),
                    ...e,
                };
                const next = [...state.logEvents, entry];
                // 50 eventi si esaurivano in pochi secondi durante un ciclo di
                // riconnessioni, cancellando proprio la riga con la causa iniziale.
                if (next.length > 400) next.splice(0, next.length - 400);
                return { logEvents: next };
            }),
            clearLog: () => set({ logEvents: [] }),
        }),
        {
            name: 'streamflow-storage',
            partialize: (state) => ({
                selectedDeviceId: state.selectedDeviceId,
                selectedDeviceLabel: state.selectedDeviceLabel,
                rememberPassword: state.rememberPassword,
                recordLocal: state.recordLocal,
                mixMode: state.mixMode,
                musicGain: state.musicGain,
                streamConfig: {
                    // Persistiamo solo le scelte dell'utente; i parametri di
                    // connessione vengono comunque riforzati dal preset in merge().
                    icecastUser: state.streamConfig.icecastUser,
                    inputGain: state.streamConfig.inputGain,
                },
                streamMetadata: {
                    artist: state.streamMetadata.artist,
                    title: '', // current song title is session-only
                },
            }),
            // Merge custom: host/porta/mount/bitrate arrivano SEMPRE dal preset,
            // anche se nel localStorage c'è una config vecchia (pre-0.7.0) con
            // valori manuali o profili salvati.
            merge: (persisted, current) => {
                const p = (persisted ?? {}) as Partial<AppState> & {
                    streamConfig?: Partial<StreamConfig>;
                };
                return {
                    ...current,
                    selectedDeviceId: p.selectedDeviceId ?? current.selectedDeviceId,
                    selectedDeviceLabel: p.selectedDeviceLabel ?? current.selectedDeviceLabel,
                    rememberPassword: p.rememberPassword ?? current.rememberPassword,
                    recordLocal: p.recordLocal ?? current.recordLocal,
                    mixMode: p.mixMode ?? current.mixMode,
                    musicGain: p.musicGain ?? current.musicGain,
                    streamMetadata: {
                        artist: p.streamMetadata?.artist ?? '',
                        title: '',
                    },
                    streamConfig: {
                        ...presetStreamConfig(),
                        icecastUser: p.streamConfig?.icecastUser || current.streamConfig.icecastUser,
                        inputGain: p.streamConfig?.inputGain ?? current.streamConfig.inputGain,
                    },
                };
            },
        }
    )
);
