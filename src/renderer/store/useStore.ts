import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StreamConfig {
    host: string;
    port: string;
    password: string;
    mount: string;
    icecastUser: string;
}

interface AppState {
    selectedDeviceId: string;
    selectedDeviceLabel: string;
    setSelectedDeviceId: (id: string) => void;
    setSelectedDeviceLabel: (label: string) => void;
    streamConfig: StreamConfig;
    setStreamConfig: (config: Partial<StreamConfig>) => void;
    // Runtime State
    isStreaming: boolean;
    streamStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    setIsStreaming: (isStreaming: boolean) => void;
    setStreamStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
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
                icecastUser: 'source'
            },
            setStreamConfig: (config) => set((state) => ({
                streamConfig: { ...state.streamConfig, ...config }
            })),
            // Initial Runtime State
            isStreaming: false,
            streamStatus: 'disconnected',
            setIsStreaming: (isStreaming) => set({ isStreaming }),
            setStreamStatus: (status) => set({ streamStatus: status }),
        }),
        {
            name: 'streamflow-storage',
            // Persist ONLY settings, exclude runtime state
            partialize: (state) => ({
                selectedDeviceId: state.selectedDeviceId,
                selectedDeviceLabel: state.selectedDeviceLabel,
                streamConfig: state.streamConfig
            }),
        }
    )
);
