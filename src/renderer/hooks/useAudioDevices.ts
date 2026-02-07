import { useState, useEffect } from 'react';

interface AudioDevice {
    deviceId: string;
    label: string;
}

export const useAudioDevices = () => {
    const [devices, setDevices] = useState<AudioDevice[]>([]);

    useEffect(() => {
        const getDevices = async () => {
            try {
                // Request permission first to get labels
                await navigator.mediaDevices.getUserMedia({ audio: true });

                const allDevices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = allDevices
                    .filter(device => device.kind === 'audioinput')
                    .map(device => ({
                        deviceId: device.deviceId,
                        label: device.label || `Microphone ${device.deviceId.slice(0, 5)}...`
                    }));

                setDevices(audioInputs);
            } catch (err) {
                console.error("Error enumerating devices:", err);
                // Fallback or empty list
            }
        };

        getDevices();

        // Listen for device changes (plug/unplug)
        navigator.mediaDevices.addEventListener('devicechange', getDevices);

        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', getDevices);
        };
    }, []);

    return { devices };
};
