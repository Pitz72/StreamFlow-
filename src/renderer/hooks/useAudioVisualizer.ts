import { useEffect, useState, useRef } from 'react';

export const useAudioVisualizer = (deviceId: string) => {
    const [volume, setVolume] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const requestRef = useRef<number>(undefined);

    useEffect(() => {
        if (!deviceId) return;

        // Flag di cancellazione: se l'effect viene pulito prima che initAudio termini
        // (cambio dispositivo rapido), tutte le operazioni async successive vengono abortite.
        let cancelled = false;

        const initAudio = async () => {
            try {
                // Chiudi il context precedente prima di aprirne uno nuovo
                if (audioContextRef.current) {
                    await audioContextRef.current.close();
                    audioContextRef.current = null;
                }
                if (cancelled) return;

                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

                // Traduci il nome DSHOW (deviceId) nell'hash Chrome per getUserMedia
                let targetDeviceId: { exact: string } | undefined = undefined;
                if (deviceId && deviceId !== 'default') {
                    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    if (cancelled) {
                        tempStream.getTracks().forEach(t => t.stop());
                        return;
                    }
                    const allDevices = await navigator.mediaDevices.enumerateDevices();
                    tempStream.getTracks().forEach(t => t.stop());
                    if (cancelled) return;

                    const matched = allDevices.find(d =>
                        d.kind === 'audioinput' &&
                        (d.label.includes(deviceId) || deviceId.includes(d.label.replace(/^(Default|Communications) - /, '').trim()))
                    );
                    if (matched) {
                        targetDeviceId = { exact: matched.deviceId };
                    }
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: targetDeviceId ? { deviceId: targetDeviceId } : true
                });
                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
                analyserRef.current = audioContextRef.current.createAnalyser();
                analyserRef.current.fftSize = 256;
                sourceRef.current.connect(analyserRef.current);

                const bufferLength = analyserRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                const animate = () => {
                    if (!analyserRef.current || cancelled) return;

                    analyserRef.current.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                    const average = sum / bufferLength;
                    const normalizedVolume = Math.min(100, (average / 128) * 100 * 1.5);

                    setVolume(normalizedVolume);
                    requestRef.current = requestAnimationFrame(animate);
                };

                animate();

            } catch (err) {
                if (!cancelled) {
                    console.error('Error initializing audio visualizer:', err);
                }
            }
        };

        initAudio();

        return () => {
            cancelled = true;
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            if (sourceRef.current?.mediaStream) {
                sourceRef.current.mediaStream.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            setVolume(0);
        };
    }, [deviceId]);

    return volume;
};
