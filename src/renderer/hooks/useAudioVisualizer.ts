import { useEffect, useRef, type RefObject } from 'react';

export interface VisualizerRefs {
    leftRef: RefObject<HTMLDivElement | null>;
    rightRef: RefObject<HTMLDivElement | null>;
}

/**
 * VU meter L/R da un'UNICA pipeline Web Audio condivisa:
 * getUserMedia → MediaStreamSource → ChannelSplitter → 2 AnalyserNode.
 *
 * PERFORMANCE: l'altezza delle barre viene scritta DIRETTAMENTE nel DOM
 * (leftRef/rightRef .style.height) dentro il loop requestAnimationFrame, SENZA
 * passare per lo stato React. Aggiornare uno useState a 60fps ri-renderizzava
 * l'intera App a ogni frame (meter a scatti). Ora React non rirenderizza mai
 * per il meter: il loop tocca solo due nodi DOM.
 *
 * - Input mono: il livello del canale unico viene duplicato su L e R.
 * - `enabled: false` smonta tutto e rilascia il microfono (indicatore
 *   privacy OS spento) — usato quando la finestra è minimizzata.
 */
export const useAudioVisualizer = (deviceId: string, enabled: boolean): VisualizerRefs => {
    const leftRef = useRef<HTMLDivElement | null>(null);
    const rightRef = useRef<HTMLDivElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const requestRef = useRef<number | null>(null);

    useEffect(() => {
        if (!deviceId || !enabled) return;

        // Flag di cancellazione: se l'effect viene pulito prima che initAudio termini
        // (cambio dispositivo rapido), tutte le operazioni async successive vengono abortite.
        let cancelled = false;
        let stream: MediaStream | null = null;

        const setBar = (ref: RefObject<HTMLDivElement | null>, pct: number) => {
            if (ref.current) ref.current.style.height = `${pct}%`;
        };

        const initAudio = async () => {
            try {
                audioContextRef.current = new AudioContext();

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

                stream = await navigator.mediaDevices.getUserMedia({
                    audio: targetDeviceId ? { deviceId: targetDeviceId } : true
                });
                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                const ctx = audioContextRef.current;
                // Il context può partire "suspended": senza resume() il loop legge
                // sempre zero (barre inerti). Va ripreso esplicitamente.
                if (ctx.state === 'suspended') {
                    ctx.resume().catch(() => { /* ignore */ });
                }

                const source = ctx.createMediaStreamSource(stream);
                const track = stream.getAudioTracks()[0];
                const isStereo = (track?.getSettings().channelCount ?? 1) >= 2;

                const analyserL = ctx.createAnalyser();
                analyserL.fftSize = 256;
                let analyserR: AnalyserNode | null = null;

                if (isStereo) {
                    const splitter = ctx.createChannelSplitter(2);
                    source.connect(splitter);
                    analyserR = ctx.createAnalyser();
                    analyserR.fftSize = 256;
                    splitter.connect(analyserL, 0);
                    splitter.connect(analyserR, 1);
                } else {
                    source.connect(analyserL);
                }

                const bufL = new Uint8Array(analyserL.frequencyBinCount);
                const bufR = new Uint8Array(analyserL.frequencyBinCount);
                const readLevel = (analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>) => {
                    analyser.getByteFrequencyData(buf);
                    let sum = 0;
                    for (let i = 0; i < buf.length; i++) sum += buf[i];
                    const average = sum / buf.length;
                    return Math.min(100, (average / 128) * 100 * 1.5);
                };

                const animate = () => {
                    if (cancelled) return;
                    const left = readLevel(analyserL, bufL);
                    const right = analyserR ? readLevel(analyserR, bufR) : left;
                    setBar(leftRef, left);
                    setBar(rightRef, right);
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
            stream?.getTracks().forEach(track => track.stop());
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => { /* già chiuso */ });
                audioContextRef.current = null;
            }
            setBar(leftRef, 0);
            setBar(rightRef, 0);
        };
    }, [deviceId, enabled]);

    return { leftRef, rightRef };
};
