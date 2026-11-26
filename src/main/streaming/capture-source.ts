/**
 * Cattura del dispositivo audio (modalità normale), separata dall'invio al server.
 *
 * Fino alla 0.10.4 un solo FFmpeg leggeva il mixer da dshow e spediva al server. Nelle
 * dirette del 16 e 23/11/2026 il cavo USB ha avuto micro-distacchi: Windows ridava il
 * mixer dopo 0,65–0,86 s, ma quella cattura non si riprendeva più, e con lei finiva la
 * diretta (silenzio fino al cane da guardia, o chiusura e riapertura a mano).
 *
 * Qui un FFmpeg piccolo fa solo la cattura e consegna PCM; chi spedisce al server è un
 * altro processo, che non si accorge di niente:
 * - se la cattura smette di dare audio o muore, si riempie il buco di silenzio al ritmo
 *   dell'orologio e si apre una cattura nuova, finché il dispositivo torna;
 * - il collegamento al server resta in piedi.
 *
 * I dati vengono sempre letti, anche quando la rete è ferma (a decidere cosa scartare è
 * chi li riceve): così «niente dati» vuol dire dispositivo, e mai rete.
 */
import { spawn, type ChildProcess } from 'child_process';

export interface CaptureFormat {
    sampleRate: number;
    channels: number;
}

export interface CaptureEvents {
    /** PCM da spedire: audio del dispositivo, oppure silenzio mentre manca. Sempre a campioni interi. */
    audio: (pcm: Buffer) => void;
    /** Il dispositivo non si è mai aperto: non c'è niente da riagganciare. */
    failed: (reason: string) => void;
    /** Il dispositivo manca da `seconds` secondi (subito, poi una volta al secondo). */
    lost: (seconds: number) => void;
    /** L'audio è tornato dopo `seconds` secondi. */
    restored: (seconds: number) => void;
    /** Righe di stderr della cattura, per il file di log. */
    diagnostic: (text: string) => void;
}

export interface CaptureOptions {
    ffmpegPath: string;
    device: string;
    format: CaptureFormat;
    /** Come si chiude un processo FFmpeg (su Windows serve taskkill). */
    kill: (proc: ChildProcess, sync: boolean) => void;
    events: CaptureEvents;
}

export class CaptureSource {
    /**
     * Silenzio della cattura oltre il quale il dispositivo è dato per perso. dshow
     * consegna un blocco ogni mezzo secondo circa: sono tre blocchi mancati.
     */
    static readonly SILENCE_AFTER_MS = 1500;
    /** Una cattura riaperta che non dà niente entro questo tempo viene rifatta. */
    static readonly REOPEN_TIMEOUT_MS = 4000;
    /** Pausa fra una cattura morta e la successiva. */
    static readonly REOPEN_DELAY_MS = 500;
    private static readonly TICK_MS = 100;
    /** Durata tipica di un blocco di dshow: il riempimento resta indietro di tanto. */
    private static readonly CHUNK_MS = 500;
    /** Un giro arrivato così in ritardo vuol dire processo fermo (standby): quel tempo non conta. */
    private static readonly LATE_MS = 1000;

    private proc: ChildProcess | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;
    private reopenTimer: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;
    private delivered = false;
    /** Da quando manca l'audio (null = sta arrivando). */
    private lostSince: number | null = null;
    private reportedSec = -1;
    private lastDataAt = 0;
    /** Fino a che istante è stato consegnato audio, vero o di riempimento. */
    private coveredUntil = 0;
    private spawnedAt = 0;
    private lastTick = 0;
    /** Byte di un campione incompleto, in attesa del resto: sfasarli darebbe rumore a tutto volume. */
    private remainder: Buffer = Buffer.alloc(0);
    private lastError = '';
    private lastDiagnostic = '';

    constructor(private readonly options: CaptureOptions) {}

    /** true se in questo momento sta arrivando audio dal dispositivo. */
    get isDelivering() { return this.delivered && this.lostSince === null; }

    private get frameBytes() { return this.options.format.channels * 2; }
    private get bytesPerSec() { return this.options.format.sampleRate * this.frameBytes; }

    start() {
        this.lastTick = Date.now();
        this.open();
        this.ticker = setInterval(() => this.tick(), CaptureSource.TICK_MS);
    }

    stop(sync = false) {
        if (this.stopped) return;
        this.stopped = true;
        if (this.ticker !== null) { clearInterval(this.ticker); this.ticker = null; }
        if (this.reopenTimer !== null) { clearTimeout(this.reopenTimer); this.reopenTimer = null; }
        this.close(sync);
    }

    private open() {
        if (this.stopped) return;
        const { ffmpegPath, device, format } = this.options;
        const args = [
            '-hide_banner', '-nostats', '-nostdin', '-loglevel', 'warning',
            '-f', 'dshow', '-i', `audio=${device}`,
            '-f', 's16le', '-ar', String(format.sampleRate), '-ac', String(format.channels), 'pipe:1',
        ];
        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        this.proc = proc;
        this.spawnedAt = Date.now();
        this.remainder = Buffer.alloc(0);
        this.lastError = '';

        proc.stdout?.on('data', (data: Buffer) => {
            if (this.proc !== proc || this.stopped) return;
            this.receive(data);
        });
        proc.stderr?.on('data', (data) => {
            if (this.proc !== proc || this.stopped) return;
            const text = String(data).trim();
            if (!text) return;
            const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
            // La riga che dice perché non si apre ("Could not find…") conta più di
            // quelle generiche che la seguono ("Error opening input").
            const specific = lines.find((l) => /could not|not found/i.test(l));
            if (specific) this.lastError = specific;
            else if (!/could not|not found/i.test(this.lastError)) {
                this.lastError = lines.find((l) => /error|failed/i.test(l)) ?? lines[lines.length - 1];
            }
            // Mentre il dispositivo manca, ogni tentativo ripete le stesse righe
            // (cambia solo l'indirizzo fra parentesi): nel file ne basta una serie.
            const key = text.replace(/@ [0-9a-fA-F]+/g, '@');
            if (key === this.lastDiagnostic) return;
            this.lastDiagnostic = key;
            this.options.events.diagnostic(text);
        });
        const ended = (why: string) => {
            if (this.proc !== proc || this.stopped) return;
            this.proc = null;
            this.handleEnd(why);
        };
        proc.on('close', (code) => ended(`uscita ${code ?? '?'}`));
        proc.on('error', (err) => ended(err.message));
    }

    private close(sync = false) {
        const proc = this.proc;
        if (!proc) return;
        this.proc = null;
        this.options.kill(proc, sync);
    }

    private handleEnd(why: string) {
        if (!this.delivered) {
            const reason = this.lastError || why;
            this.stop();
            this.options.events.failed(reason);
            return;
        }
        if (this.lostSince === null) this.markLost();
        if (this.stopped || this.reopenTimer !== null) return;
        this.reopenTimer = setTimeout(() => {
            this.reopenTimer = null;
            if (!this.proc) this.open();
        }, CaptureSource.REOPEN_DELAY_MS);
    }

    private markLost() {
        this.lostSince = this.lastDataAt;
        this.coveredUntil = this.lastDataAt;
        this.reportedSec = -1;
        this.report(Date.now());
    }

    private report(now: number) {
        if (this.lostSince === null) return;
        const sec = Math.floor((now - this.lostSince) / 1000);
        if (sec === this.reportedSec) return;
        this.reportedSec = sec;
        this.options.events.lost(sec);
    }

    /** Silenzio fino all'istante `until`, a campioni interi. */
    private fill(until: number) {
        const frames = Math.floor(((until - this.coveredUntil) / 1000) * this.options.format.sampleRate);
        if (frames <= 0) return;
        this.coveredUntil += (frames / this.options.format.sampleRate) * 1000;
        this.options.events.audio(Buffer.alloc(frames * this.frameBytes));
    }

    private receive(data: Buffer) {
        const joined = this.remainder.length > 0 ? Buffer.concat([this.remainder, data]) : data;
        const whole = joined.length - (joined.length % this.frameBytes);
        this.remainder = joined.subarray(whole);
        if (whole === 0) return;
        const pcm = joined.subarray(0, whole);
        const now = Date.now();
        if (this.lostSince !== null) {
            // Il blocco appena arrivato copre già il tratto finale del buco.
            this.fill(now - (pcm.length / this.bytesPerSec) * 1000);
            if (this.stopped) return;
            const seconds = (now - this.lostSince) / 1000;
            this.lostSince = null;
            this.lastDiagnostic = '';
            this.options.events.restored(seconds);
        }
        if (this.stopped) return;
        this.delivered = true;
        this.lastDataAt = now;
        this.coveredUntil = now;
        this.options.events.audio(pcm);
    }

    private tick() {
        const now = Date.now();
        const late = now - this.lastTick - CaptureSource.TICK_MS;
        this.lastTick = now;
        if (late > CaptureSource.LATE_MS) {
            this.lastDataAt += late;
            this.spawnedAt += late;
            this.coveredUntil += late;
            if (this.lostSince !== null) this.lostSince += late;
            return;
        }
        if (this.lostSince === null) {
            if (!this.delivered || now - this.lastDataAt < CaptureSource.SILENCE_AFTER_MS) return;
            this.markLost();
            if (this.stopped) return;
            // Viva ma muta: è il caso del dispositivo staccato. Se ne apre subito un'altra.
            this.close();
            this.open();
            return;
        }
        // Un blocco indietro: quando il dispositivo torna, il suo primo blocco copre
        // quel tratto invece di accodarsi al silenzio e ritardare la diretta.
        this.fill(now - CaptureSource.CHUNK_MS);
        if (this.stopped) return;
        this.report(now);
        if (this.stopped) return;
        if (this.proc && now - this.spawnedAt >= CaptureSource.REOPEN_TIMEOUT_MS) {
            this.close();
            this.open();
        }
    }
}
