import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StreamMetadata {
    showName: string;
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
}

interface AppState {
    selectedDeviceId: string;
    selectedDeviceLabel: string;
    setSelectedDeviceId: (id: string) => void;
    setSelectedDeviceLabel: (label: string) => void;
    streamConfig: StreamConfig;
    setStreamConfig: (config: Partial<StreamConfig>) => void;
    // Now Playing metadata
    streamMetadata: StreamMetadata;
    setStreamMetadata: (meta: Partial<StreamMetadata>) => void;
    // Runtime State
    isStreaming: boolean;
    streamStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    setIsStreaming: (isStreaming: boolean) => void;
    setStreamStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
    // Error notification (non-blocking toast)
    errorMessage: string | null;
    setErrorMessage: (message: string | null) => void;
}

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            selectedDeviceId: 'default',
            selectedDeviceLabel: 'default',
            setSelectedDeviceId: (id) => set({ selectedDeviceId: id }),
            setSelectedDeviceLabel: (label) => set({ selectedDeviceLabel: label }),
            streamConfig: {
                host: 'stream.example.com',
                port: '8000',
                password: '',
                mount: '/live',
                icecastUser: 'source',
                bitrate: '128'
            },
            setStreamConfig: (config) => set((state) => ({
                streamConfig: { ...state.streamConfig, ...config }
            })),
            // Now Playing metadata
            streamMetadata: { showName: '', artist: '', title: '' },
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
        }),
        {
            name: 'streamflow-storage',
            partialize: (state) => ({
                selectedDeviceId: state.selectedDeviceId,
                selectedDeviceLabel: state.selectedDeviceLabel,
                streamConfig: {
                    host: state.streamConfig.host,
                    port: state.streamConfig.port,
                    mount: state.streamConfig.mount,
                    icecastUser: state.streamConfig.icecastUser,
                    bitrate: state.streamConfig.bitrate,
                    password: '', // never persisted to localStorage
                },
                streamMetadata: {
                    showName: state.streamMetadata.showName,
                    artist: state.streamMetadata.artist,
                    title: '', // current song title is session-only
                },
            }),
        }
    )
);
