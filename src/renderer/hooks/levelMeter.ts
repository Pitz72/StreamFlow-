import type { RefObject } from 'react';

/**
 * Comando delle barre di livello, condiviso dalle due pipeline audio che
 * possono guidarle: useAudioVisualizer (sorgente singola) e useMixEngine
 * (MIX MODE, livello post-mix). Una sola conversione livello→barra per
 * entrambe: devono comportarsi allo stesso modo in ogni modalità.
 *
 * La scala colorata (verde, ambra, rosso) è ferma sotto; il ref punta alla
 * COPERTURA della parte spenta, ancorata a destra, che si accorcia quando il
 * livello sale. Così i colori restano al loro posto invece di stirarsi con la
 * barra. È un `transform: scaleX()` scritto a ogni fotogramma: niente re-render
 * React, e lo strato è del compositore (vedi PresentazioneContinua.tsx).
 */
export const setLevel = (ref: RefObject<HTMLDivElement | null>, pct: number) => {
    if (!ref.current) return;
    const clamped = pct < 0 ? 0 : pct > 100 ? 100 : pct;
    ref.current.style.transform = `scaleX(${(100 - clamped) / 100})`;
};

/** Livello 0-100 da un AnalyserNode, stessa scala usata dai VU dalla 0.1.x. */
export const readLevel = (analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>) => {
    analyser.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const average = sum / buf.length;
    return Math.min(100, (average / 128) * 100 * 1.5);
};

export interface LevelRefs {
    leftRef: RefObject<HTMLDivElement | null>;
    rightRef: RefObject<HTMLDivElement | null>;
}
