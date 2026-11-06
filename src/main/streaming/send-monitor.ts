/**
 * Sorveglianza dell'invio durante la diretta, dalle righe di progresso di FFmpeg.
 *
 * Nasce dalla diretta del 6/11/2026: alle 11:42:58 dshow ha scartato un pezzo d'audio
 * del microfono («real-time buffer … too full … frame dropped!»), perché per una
 * decina di secondi l'audio non usciva abbastanza in fretta. L'unica traccia era quella
 * riga nel file; le righe di progresso, che avrebbero detto se e quanto l'invio si era
 * fermato, non venivano salvate (arrivano ogni mezzo secondo).
 *
 * Qui:
 * 1. una pausa fra due righe di progresso più lunga di STALL_MS diventa un avviso a video;
 * 2. ogni SUMMARY_MS una riga riassuntiva va nel file (non a video);
 * 3. l'audio scartato da dshow diventa un avviso in italiano, al massimo uno ogni
 *    DROP_NOTICE_MS, con il conto dei pezzi persi nel frattempo.
 *
 * Logica pura: l'istante arriva da fuori, così i test non aspettano.
 */

/** Pausa nell'invio oltre la quale chi ascolta può accorgersene. */
export const STALL_MS = 3000;
/** Ogni quanto scrivere nel file la riga riassuntiva. */
export const SUMMARY_MS = 60_000;
/** Distanza minima fra due avvisi di audio scartato. */
export const DROP_NOTICE_MS = 30_000;

export interface Progress {
    /** Dati inviati finora (kB, come li conta FFmpeg). */
    kB: number;
    /** Secondi di audio inviati finora (il time= di FFmpeg). */
    outSec: number;
    /** Bitrate medio dichiarato da FFmpeg, se c'è. */
    kbps: number | null;
}

/** Legge una riga di progresso («size= 470kB time=00:00:19.98 bitrate= 192.5kbits/s …»). */
export function parseProgress(line: string): Progress | null {
    const size = /size=\s*(\d+)\s*[kK]i?B/.exec(line);
    const time = /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
    if (!size || !time) return null;
    const rate = /bitrate=\s*([\d.]+)\s*kbits\/s/.exec(line);
    return {
        kB: Number(size[1]),
        outSec: Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]),
        kbps: rate ? Number(rate[1]) : null,
    };
}

/** dshow ha scartato audio perché FFmpeg non lo leggeva abbastanza in fretta. */
export const isDshowDrop = (text: string) => /real-time buffer .*too full.*frame dropped/i.test(text);

const clock = (sec: number) => {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

const it1 = (n: number) => n.toFixed(1).replace('.', ',');

export class SendMonitor {
    private started = false;
    private firstAt = 0;
    private firstOut = 0;
    private lastAt = 0;
    private nextSummaryAt = 0;
    private stalls = 0;
    private drops = 0;
    private lastDropNoticeAt = Number.NEGATIVE_INFINITY;
    private dropsSinceNotice = 0;

    /**
     * Una riga di progresso letta all'istante `now` (ms).
     * `bundled`: nello stesso blocco di stderr c'erano altre righe di progresso. FFmpeg
     * le scrive almeno a mezzo secondo l'una dall'altra, quindi arrivate insieme vuol
     * dire che il ritardo è stato nostro (processo principale occupato), non dell'invio.
     */
    progress(p: Progress, now: number, bundled: boolean): { stallSec?: number; summary?: string } {
        if (!this.started) {
            this.started = true;
            this.firstAt = now;
            this.firstOut = p.outSec;
            this.lastAt = now;
            this.nextSummaryAt = now + SUMMARY_MS;
            return {};
        }
        const out: { stallSec?: number; summary?: string } = {};
        const gap = now - this.lastAt;
        this.lastAt = now;
        if (!bundled && gap > STALL_MS) {
            this.stalls++;
            out.stallSec = Math.round(gap / 100) / 10;
        }
        if (now >= this.nextSummaryAt) {
            while (this.nextSummaryAt <= now) this.nextSummaryAt += SUMMARY_MS;
            const wall = (now - this.firstAt) / 1000;
            // Audio che doveva essere partito e non lo è: cresce con le pause e con
            // l'audio scartato, torna verso zero quando l'invio recupera.
            const lag = wall - (p.outSec - this.firstOut);
            out.summary = `invio: in onda da ${clock(wall)}, ${it1(p.kB / 1024)} MB inviati`
                + (p.kbps !== null ? `, ${Math.round(p.kbps)} kbit/s` : '')
                + `, ritardo accumulato ${it1(lag)} s`
                + `, pause ${this.stalls}, audio scartato ${this.drops} volte`;
        }
        return out;
    }

    /** dshow ha scartato audio all'istante `now`: l'avviso da mostrare, o null se troppo vicino al precedente. */
    drop(now: number): string | null {
        this.drops++;
        this.dropsSinceNotice++;
        if (now - this.lastDropNoticeAt < DROP_NOTICE_MS) return null;
        const n = this.dropsSinceNotice;
        this.dropsSinceNotice = 0;
        this.lastDropNoticeAt = now;
        return 'il microfono ha perso un pezzo d\'audio: per qualche secondo l\'audio non usciva '
            + 'abbastanza in fretta verso il server (rete lenta?). Chi ascolta può aver sentito un salto'
            + (n > 1 ? ` (${n} pezzi persi dall'avviso precedente)` : '');
    }
}

/** Avviso a video per una pausa nell'invio. */
export const stallMessage = (sec: number) =>
    `l'invio verso il server si è fermato per ${it1(sec)} secondi, poi è ripartito: `
    + 'rete lenta o interrotta. Chi ascolta può aver sentito una pausa';
