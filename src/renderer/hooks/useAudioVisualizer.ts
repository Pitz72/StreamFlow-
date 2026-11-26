import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { readLevel, setLevel, type LevelRefs } from './levelMeter';
import { resolveInputDeviceId } from './resolveInputDevice';

// I ref puntano al riempimento delle barre di livello: il loop scrive
// direttamente la larghezza (transform: scaleX) senza passare per lo stato React.
export type VisualizerRefs = LevelRefs;

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
    // Cambia quando la cattura va rifatta: un dispositivo staccato e ricollegato
    // lasciava le barre ferme fino al riavvio.
    const [epoch, setEpoch] = useState(0);

    // VU POST-GAIN: le barre riflettono il volume input impostato (anche live).
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
        /** true = il dispositivo scelto non c'era e si legge il predefinito. */
        let fallback = false;
        let retryTimer: number | null = null;
        const retry = () => {
            if (cancelled || retryTimer !== null) return;
            retryTimer = window.setTimeout(() => setEpoch((n) => n + 1), 1000);
        };
        const onDeviceChange = () => {
            const track = stream?.getAudioTracks()[0];
            if (!track || track.readyState === 'ended' || fallback) retry();
        };
        navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);

        const initAudio = async () => {
            try {
                audioContextRef.current = new AudioContext();

                // Traduci il nome DSHOW (deviceId) nell'hash Chrome per getUserMedia
                const resolvedId = await resolveInputDeviceId(deviceId);
                if (cancelled) return;
                const targetDeviceId = resolvedId ? { exact: resolvedId } : undefined;
                fallback = !resolvedId;

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
                track?.addEventListener('ended', retry);
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
                    setLevel(leftRef, rawLeft * mul);
                    setLevel(rightRef, rawRight * mul);
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
            if (retryTimer !== null) window.clearTimeout(retryTimer);
            navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            stream?.getTracks().forEach(track => track.stop());
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => { /* già chiuso */ });
                audioContextRef.current = null;
            }
            setLevel(leftRef, 0);
            setLevel(rightRef, 0);
        };
    }, [deviceId, enabled, epoch]);

    return { leftRef, rightRef };
};
