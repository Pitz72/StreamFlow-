import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ServerProfile {
    name: string;
    host: string;
    port: string;
    mount: string;
    icecastUser: string;
    bitrate: string;
}

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
    // Server profiles (B1)
    profiles: ServerProfile[];
    saveProfile: (name: string) => void;
    loadProfile: (name: string) => void;
    deleteProfile: (name: string) => void;
    // AzuraCast context for cover art (B2)
    azuraCastUrl: string;
    azuraCastApiKey: string;
    azuraCastStationId: number | null;
    setAzuraCastContext: (url: string, apiKey: string, stationId: number) => void;
}

export const useStore = create<AppState>()(
    persist(
        (set, get) => ({
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
            // Server profiles (B1)
            profiles: [],
            saveProfile: (name) => {
                const { streamConfig, profiles } = get();
                const profile: ServerProfile = {
                    name: name.trim(),
                    host: streamConfig.host,
                    port: streamConfig.port,
                    mount: streamConfig.mount,
                    icecastUser: streamConfig.icecastUser,
                    bitrate: streamConfig.bitrate,
                };
                const filtered = profiles.filter(p => p.name !== profile.name);
                set({ profiles: [...filtered, profile] });
            },
            loadProfile: (name) => {
                const profile = get().profiles.find(p => p.name === name);
                if (!profile) return;
                set((state) => ({
                    streamConfig: {
                        ...state.streamConfig,
                        host: profile.host,
                        port: profile.port,
                        mount: profile.mount,
                        icecastUser: profile.icecastUser,
                        bitrate: profile.bitrate,
                    }
                }));
            },
            deleteProfile: (name) => {
                set((state) => ({ profiles: state.profiles.filter(p => p.name !== name) }));
            },
            // AzuraCast context (B2) — apiKey is session-only (not persisted)
            azuraCastUrl: '',
            azuraCastApiKey: '',
            azuraCastStationId: null,
            setAzuraCastContext: (url, apiKey, stationId) =>
                set({ azuraCastUrl: url, azuraCastApiKey: apiKey, azuraCastStationId: stationId }),
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
                profiles: state.profiles,
                azuraCastUrl: state.azuraCastUrl,
                azuraCastStationId: state.azuraCastStationId,
                // azuraCastApiKey: intentionally excluded
            }),
        }
    )
);
