import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StreamConfig {
    host: string;
    port: string;
    password: string;
    mount: string;
}

interface AppState {
    selectedDeviceId: string;
    selectedDeviceLabel: string;
    setSelectedDeviceId: (id: string) => void;
    setSelectedDeviceLabel: (label: string) => void;
    streamConfig: StreamConfig;
    setStreamConfig: (config: Partial<StreamConfig>) => void;
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
                mount: '/live'
            },
            setStreamConfig: (config) => set((state) => ({
                streamConfig: { ...state.streamConfig, ...config }
            })),
        }),
        {
            name: 'streamflow-storage',
        }
    )
);
