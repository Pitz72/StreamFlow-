import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { readLevel, setNeedle, type NeedleRefs } from './vuNeedle';
import { resolveInputDeviceId } from './resolveInputDevice';

// I ref puntano alle lancette SVG dei VU meter ad ago: il loop scrive
// direttamente la rotazione (transform) senza passare per lo stato React.
export type VisualizerRefs = NeedleRefs;

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
    const leftRef = useRef<SVGRectElement | null>(null);
    const rightRef = useRef<SVGRectElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const requestRef = useRef<number | null>(null);

    // VU POST-GAIN: le lancette riflettono il volume input impostato (anche live).
    // Web Audio legge il device grezzo (pre-gain); il guadagno reale è applicato
    // dentro FFmpeg. Per la sola VISUALIZZAZIONE moltiplichiamo il livello per lo
    // stesso fattore, letto dallo store via ref (nessun re-render, il filtro
    // volume di FFmpeg è lineare quindi la scala è equivalente).
    const gainMulRef = useRef(1);
    useEffect(() => {
        const readGain = (raw: string) => {
            const pct = parseInt(raw, 10);
            return Number.isFinite(pct) ? Math.max(0, Math.min(200, pct)) / 100 : 1;
        };
        gainMulRef.current = readGain(useStore.getState().streamConfig.inputGain);
        const unsubscribe = useStore.subscribe((state) => {
            gainMulRef.current = readGain(state.streamConfig.inputGain);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!deviceId || !enabled) return;

        // Flag di cancellazione: se l'effect viene pulito prima che initAudio termini
        // (cambio dispositivo rapido), tutte le operazioni async successive vengono abortite.
        let cancelled = false;
        let stream: MediaStream | null = null;

        const initAudio = async () => {
            try {
                audioContextRef.current = new AudioContext();

                // Traduci il nome DSHOW (deviceId) nell'hash Chrome per getUserMedia
                const resolvedId = await resolveInputDeviceId(deviceId);
                if (cancelled) return;
                const targetDeviceId = resolvedId ? { exact: resolvedId } : undefined;

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

                const animate = () => {
                    if (cancelled) return;
                    const mul = gainMulRef.current;
                    const rawLeft = readLevel(analyserL, bufL);
                    const rawRight = analyserR ? readLevel(analyserR, bufR) : rawLeft;
                    setNeedle(leftRef, rawLeft * mul);
                    setNeedle(rightRef, rawRight * mul);
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
            setNeedle(leftRef, 0);
            setNeedle(rightRef, 0);
        };
    }, [deviceId, enabled]);

    return { leftRef, rightRef };
};
