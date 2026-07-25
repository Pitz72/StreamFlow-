import type { RefObject } from 'react';

/**
 * Comando delle lancette dei VU meter, condiviso dalle due pipeline audio che
 * possono guidarle: useAudioVisualizer (sorgente singola) e useMixEngine
 * (MIX MODE, livello post-mix). Una sola conversione livello→angolo per
 * entrambe: le lancette devono comportarsi allo stesso modo in ogni modalità.
 */

// Il quadrante déco copre da riposo (a sinistra) alla zona rossa "+3" (a destra).
export const NEEDLE_MIN_DEG = -42;
export const NEEDLE_MAX_DEG = 46;

export const setNeedle = (ref: RefObject<SVGRectElement | null>, pct: number) => {
    if (!ref.current) return;
    const clamped = pct < 0 ? 0 : pct > 100 ? 100 : pct;
    const deg = NEEDLE_MIN_DEG + (clamped / 100) * (NEEDLE_MAX_DEG - NEEDLE_MIN_DEG);
    ref.current.style.transform = `rotate(${deg}deg)`;
};

/** Livello 0-100 da un AnalyserNode, stessa scala usata dai VU dalla 0.1.x. */
export const readLevel = (analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>) => {
    analyser.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const average = sum / buf.length;
    return Math.min(100, (average / 128) * 100 * 1.5);
};

export interface NeedleRefs {
    leftRef: RefObject<SVGRectElement | null>;
    rightRef: RefObject<SVGRectElement | null>;
}
