import { useEffect, useState, useRef } from 'react';

export const useAudioVisualizer = (deviceId: string) => {
    const [volume, setVolume] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const requestRef = useRef<number>(undefined);

    useEffect(() => {
        if (!deviceId) return;

        const initAudio = async () => {
            try {
                // Close previous context if exists
                if (audioContextRef.current) {
                    await audioContextRef.current.close();
                }

                // 1. Create Audio Context
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

                // Dobbiamo tradurre il DSHOW name (deviceId) nell'Hash di Chrome per getUserMedia
                let targetDeviceId: any = undefined;
                if (deviceId && deviceId !== 'default') {
                    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const allDevices = await navigator.mediaDevices.enumerateDevices();
                    tempStream.getTracks().forEach(t => t.stop()); // libero il mic

                    const matched = allDevices.find(d =>
                        d.kind === 'audioinput' &&
                        (d.label.includes(deviceId) || deviceId.includes(d.label.replace(/^(Default|Communications) - /, '').trim()))
                    );

                    if (matched) {
                        targetDeviceId = { exact: matched.deviceId };
                    }
                }

                // 2. Get Stream con ID Chrome (se matchato) o default
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: targetDeviceId ? { deviceId: targetDeviceId } : true
                });

                // 3. Create Source and Analyser
                sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
                analyserRef.current = audioContextRef.current.createAnalyser();
                analyserRef.current.fftSize = 256; // Smaller fft for faster reaction

                sourceRef.current.connect(analyserRef.current);

                // 4. Analysis Loop
                const bufferLength = analyserRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                const animate = () => {
                    if (!analyserRef.current) return;

                    analyserRef.current.getByteFrequencyData(dataArray);

                    // Calculate RMS (Root Mean Square) for volume
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) {
                        sum += dataArray[i];
                    }
                    const average = sum / bufferLength;

                    // Normalize to 0-100 roughly
                    // audio levels are logarithmic, but for simple vu meter linear approx or slight scaling is ok
                    // raw values are 0-255. 
                    const normalizedVolume = Math.min(100, (average / 128) * 100 * 1.5); // 1.5 multiplier for gain visual

                    setVolume(normalizedVolume);

                    requestRef.current = requestAnimationFrame(animate);
                };

                animate();

            } catch (err) {
                console.error("Error initializing audio visualizer:", err);
            }
        };

        const cleanup = () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            // Stop tracks to release microphone
            if (sourceRef.current && sourceRef.current.mediaStream) {
                sourceRef.current.mediaStream.getTracks().forEach(track => track.stop());
            }
        };

        initAudio();

        return cleanup;
    }, [deviceId]);

    return volume;
};
