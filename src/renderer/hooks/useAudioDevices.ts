import { useState, useEffect } from 'react';

interface AudioDevice {
    deviceId: string;
    label: string;
}

export const useAudioDevices = () => {
    const [devices, setDevices] = useState<AudioDevice[]>([]);

    useEffect(() => {
        const fetchNativeDevices = async () => {
            try {
                // Chiamata all'IPC nativo che lancia ffmpeg -list_devices
                if (window.electronAPI && window.electronAPI.getAudioDevices) {
                    const deviceNames = await window.electronAPI.getAudioDevices();

                    const audioInputs = deviceNames.map(name => ({
                        // Usa il nome esatto hardware come ID univoco a livello OS
                        deviceId: name,
                        label: name
                    }));

                    setDevices(audioInputs);
                } else {
                    console.error("Electron API for getAudioDevices is missing.");
                }
            } catch (err) {
                console.error("Error fetching native devices:", err);
            }
        };

        fetchNativeDevices();

        // Optional: Polling o event listening nativo (per ora il fetch on mount è sufficiente)
    }, []);

    return { devices };
};
