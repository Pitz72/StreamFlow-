import { spawn, ChildProcess, exec, execSync } from 'child_process';
import ffmpegPathRaw from 'ffmpeg-static';
import { app, BrowserWindow, powerSaveBlocker } from 'electron';
import fs from 'fs';
import path from 'path';
import { sendFilterCommand, isPortFree } from './zmq-command';
import { writeRaw } from '../file-logger';
import { deletePassword } from '../credentials';
import { httpAuthCheck } from './connection-diagnostic';
import { classifyExit } from './exit-classifier';

// In production (asar), ffmpeg-static resolves inside app.asar which cannot be spawned.
// We replace 'app.asar' with 'app.asar.unpacked' to point to the extracted binary.
const ffmpegPath = ffmpegPathRaw?.replace('app.asar', 'app.asar.unpacked') ?? null;

interface StreamConfig {
    inputDeviceName: string;
    host: string;
    port: string;
    password: string;
    mount: string;
    icecastUser?: string;
    bitrate?: string;
    /** Guadagno input come percentuale ("100" = 1.0x, range 0-200). */
    inputGain?: string;
    /** true = registra la diretta anche su file MP3 locale (C2, via muxer tee). */
    recordLocal?: boolean;
    /**
     * MIX MODE: l'audio non arriva più da dshow ma già mixato (microfono +
     * audio di sistema) dal renderer, come PCM grezzo su stdin.
     */
    mixMode?: boolean;
}

/** Formato del PCM che il mixer del renderer scrive su stdin. Deve combaciare con useMixEngine. */
export const MIX_PCM = { sampleRate: 48000, channels: 2 } as const;

/**
 * Escaping per i valori delle opzioni slave del muxer tee. Il tee fa DUE livelli
 * di parsing (split degli slave su '|', poi opzioni su ':'), ciascuno dei quali
 * consuma un livello di '\': un ':' letterale (es. negli header HTTP) deve
 * arrivare al secondo livello ancora escapato → due backslash nell'argomento.
 * Validato headless contro ffmpeg-static (vedi docs/log/0.7.1.md).
 */
export function teeEscapeOptionValue(s: string): string {
    return s
        .replace(/\\/g, '\\\\\\\\')
        .replace(/:/g, '\\\\:')
        .replace(/\|/g, '\\\\|')
        .replace(/\[/g, '\\\\[')
        .replace(/\]/g, '\\\\]');
}

/** Escaping del percorso file nello slave tee (solo primo livello: '|' '[' ']'). */
export function teeEscapePath(s: string): string {
    return s
        .replace(/\\/g, '/')
        .replace(/\|/g, '\\|')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
}

type StreamStatus = 'connecting' | 'connected' | 'error' | 'disconnected' | 'reconnecting';

export class StreamManager {
    /** Backoff riconnessione: 5s → 10s → 30s → 60s → 120s, poi stop definitivo. */
    private static readonly RECONNECT_DELAYS_MS = [5000, 10000, 30000, 60000, 120000];
    /** Porta del broker azmq (bind default FFmpeg `tcp://*:5555`, client su loopback). */
    private static readonly ZMQ_PORT = 5555;
    /**
     * Tenuta minima prima di dichiarare ON AIR. La prima riga `size=` di FFmpeg
     * NON prova che il server abbia accettato: con password errata FFmpeg scrive
     * per ~0,65s prima del reset (-10054) e stampa comunque il progresso — il
     * server risponde 401 in ~470ms, ma FFmpeg non lo legge. Tre secondi di
     * trasmissione continua escludono il rifiuto delle credenziali.
     */
    private static readonly CONFIRM_LIVE_MS = 3000;
    /**
     * Il contatore delle riconnessioni si azzera solo dopo un minuto di diretta
     * stabile. Azzerarlo al primo `size=` rendeva il backoff infinito: ogni
     * tentativo "partiva" per un attimo e il contatore restava fermo su 1/5.
     */
    private static readonly STABLE_RESET_MS = 60000;
    /** MIX MODE: attesa massima del primo blocco PCM dal mixer del renderer. */
    private static readonly MIX_NO_AUDIO_MS = 5000;
    /**
     * Attesa massima della prima riga di progresso. FFmpeg rinuncia da sé a un
     * server che non risponde dopo ~5s (il suo timeout TCP): oltre questo limite
     * il silenzio viene dal dispositivo audio, che si apre ma non produce dati.
     */
    private static readonly CONNECT_TIMEOUT_MS = 15000;
    /** Arresto pulito ('q' o fine di stdin): oltre questo tempo si uccide. */
    private static readonly GRACEFUL_STOP_MS = 3000;

    private ffmpegProcess: ChildProcess | null = null;
    /** Processi fermati dall'utente che stanno ancora chiudendo file e connessione. */
    private drainingProcs = new Set<ChildProcess>();
    private mainWindow: BrowserWindow | null = null;
    private logSink: ((level: 'info' | 'success' | 'error', msg: string) => void) | null = null;

    /** Config dell'ultimo start richiesto dall'utente — serve ai retry. null = nessuna sessione attiva. */
    private currentConfig: StreamConfig | null = null;
    private reconnectAttempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private countdownTimer: ReturnType<typeof setInterval> | null = null;
    /** true quando il filtro azmq è attivo → volume regolabile in diretta. */
    private liveVolumeActive = false;
    /** true quando FFmpeg legge da stdin (MIX MODE): abilita writeAudioChunk. */
    private mixInputActive = false;
    /** Log "una volta sola" quando scartiamo PCM per pipe intasata. */
    private mixBackpressureLogged = false;
    /** MIX MODE: byte di PCM consegnati al processo corrente (0 = mixer muto). */
    private mixBytesWritten = 0;
    /**
     * true se in questa sessione la diretta è stata confermata almeno una volta.
     * Decide se un fallimento va ritentato (caduta di una diretta vera) o
     * riportato come errore (primo collegamento mai riuscito: configurazione o
     * credenziali, che ritentare non risolve).
     */
    private sessionWasLive = false;
    /** Id del powerSaveBlocker attivo durante la sessione (null = PC libero di andare in standby). */
    private powerBlockId: number | null = null;
    /** Ultimo stato inviato: serve a riallineare un'interfaccia ricaricata dopo un crash. */
    private lastStatus: StreamStatus = 'disconnected';
    private lastStatusMessage: string | undefined;

    constructor(mainWindow: BrowserWindow | null) {
        this.mainWindow = mainWindow;
    }

    public setMainWindow(window: BrowserWindow) {
        this.mainWindow = window;
    }

    public setLogSink(sink: (level: 'info' | 'success' | 'error', msg: string) => void) {
        this.logSink = sink;
    }

    private log(level: 'info' | 'success' | 'error', msg: string) {
        if (this.logSink) this.logSink(level, msg);
        console.log(`[StreamManager] ${level}: ${msg}`);
    }

    /**
     * Traduce l'errore di FFmpeg in una causa comprensibile a chi trasmette.
     * Serve a chi riceve il log senza saperlo leggere: "401" non dice niente,
     * "password DJ errata" sì.
     */
    private explainConnectError(raw: string): string {
        if (/\b401\b|Unauthorized/i.test(raw)) {
            return 'credenziali rifiutate dal server (nome utente o password DJ errati)';
        }
        if (/\b403\b|access denied/i.test(raw)) {
            return 'accesso negato: utente valido ma non autorizzato su questo mount, oppure un altro DJ è già collegato';
        }
        if (/\b404\b/.test(raw)) {
            return 'mount inesistente sul server';
        }
        if (/Connection refused/i.test(raw)) {
            return 'nessun servizio in ascolto sulla porta indicata, oppure la porta è bloccata da firewall/antivirus';
        }
        return 'connessione al server fallita';
    }

    public static async getWindowsAudioDevices(): Promise<string[]> {
        return new Promise((resolve) => {
            if (process.platform !== 'win32' || !ffmpegPath) {
                resolve([]);
                return;
            }

            const getDevices = spawn(ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { windowsHide: true });
            const devices: string[] = [];
            let outputBuffer = '';

            // Safety: se FFmpeg si blocca, non lasciamo la promise pendente per sempre
            // (bloccherebbe il caricamento della lista device nella UI).
            const timeoutId = setTimeout(() => {
                try { getDevices.kill(); } catch { /* già morto */ }
                resolve([]);
            }, 10000);

            getDevices.stderr?.on('data', (data) => {
                outputBuffer += data.toString();
            });

            getDevices.on('close', () => {
                clearTimeout(timeoutId);
                // Analizziamo l'intero buffer di output quando FFmpeg termina
                const lines = outputBuffer.split('\n');

                for (const line of lines) {
                    // Cerca esplicitamente le linee taggate come (audio) da dshow
                    if (line.includes('(audio)')) {
                        // Estraiamo la stringa contenuta tra doppie virgolette (il Nome HW)
                        const match = line.match(/"([^"]+)"/);
                        if (match && match[1]) {
                            devices.push(match[1]);
                        }
                    }
                }
                // Dedup: nomi identici produrrebbero <option> con chiavi duplicate nella UI
                resolve([...new Set(devices)]);
            });

            getDevices.on('error', () => {
                clearTimeout(timeoutId);
                resolve([]);
            });
        });
    }

    /**
     * true finché c'è una sessione da proteggere: diretta in corso, collegamento
     * in corso o riconnessione in attesa. È il criterio della conferma di
     * chiusura e del blocco dello standby.
     */
    public isSessionActive(): boolean {
        return this.currentConfig !== null || this.ffmpegProcess !== null || this.reconnectTimer !== null;
    }

    /** Ultimo stato inviato all'interfaccia, per riallinearla dopo un ricaricamento. */
    public getStatusSnapshot(): { status: StreamStatus; message?: string } {
        return { status: this.lastStatus, message: this.lastStatusMessage };
    }

    /**
     * Tiene sveglio il PC finché la sessione è attiva. Senza, una diretta lunga
     * senza tocchi di tastiera (pre-show a rotazione, brani lunghi) lascia che
     * Windows mandi in sospensione il portatile: la diretta muore in silenzio.
     * 'prevent-app-suspension' blocca la sospensione ma lascia spegnere lo schermo.
     */
    private updatePowerBlock(status: StreamStatus) {
        const active = status === 'connecting' || status === 'connected' || status === 'reconnecting';
        if (active && this.powerBlockId === null) {
            try {
                this.powerBlockId = powerSaveBlocker.start('prevent-app-suspension');
                this.log('info', 'standby del computer bloccato per tutta la sessione');
            } catch (e) {
                this.log('error', `impossibile bloccare lo standby del computer: ${(e as Error).message}`);
            }
        } else if (!active && this.powerBlockId !== null) {
            try {
                if (powerSaveBlocker.isStarted(this.powerBlockId)) powerSaveBlocker.stop(this.powerBlockId);
            } catch { /* già rilasciato */ }
            this.powerBlockId = null;
            this.log('info', 'standby del computer di nuovo consentito');
        }
    }

    private sendStatus(status: StreamStatus, message?: string) {
        this.lastStatus = status;
        this.lastStatusMessage = message;
        // Prima dell'invio: il blocco dello standby non dipende dall'esistenza
        // della finestra (un'interfaccia in crash non deve lasciar dormire il PC).
        this.updatePowerBlock(status);
        // La finestra può essere già distrutta (quit mentre si è ON AIR):
        // inviare su webContents distrutto lancia "Object has been destroyed".
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        try {
            this.mainWindow.webContents.send('STREAM_STATUS', status, message);
        } catch { /* finestra in chiusura */ }
    }

    /** @returns Promise<false> se lo stream non può partire (binario FFmpeg mancante). */
    public start(config: StreamConfig): Promise<boolean> {
        // Nuovo start richiesto dall'utente: annulla eventuali retry pendenti e
        // termina il processo corrente. I listener del vecchio processo si
        // auto-disattivano tramite il guard di identità (this.ffmpegProcess !== proc).
        this.cancelReconnect();
        this.reconnectAttempt = 0;
        this.sessionWasLive = false;
        // Un processo ancora in arresto pulito occupa il mount: il nuovo verrebbe rifiutato.
        this.killDraining();
        this.killCurrentProcess();
        this.currentConfig = config;
        return this.launch();
    }

    /** Rifiuta un avvio con un errore visibile (es. test di connessione in corso sullo stesso mount). */
    public refuseStart(message: string) {
        this.log('error', `✗ ${message}`);
        this.sendStatus('error', message);
    }

    /**
     * Avvia (o riavvia, in caso di retry) FFmpeg con la config corrente.
     * Tutti i listener del processo controllano `this.ffmpegProcess === proc`
     * prima di toccare lo stato condiviso: un processo sostituito o fermato
     * dall'utente non può più alterare status/riferimenti (era la race che
     * produceva stream orfani e falsi stati di errore).
     */
    private async launch(): Promise<boolean> {
        const config = this.currentConfig;
        if (!config) return false;
        if (!ffmpegPath) {
            this.sendStatus('error', 'FFmpeg binary not found');
            return false;
        }

        const { inputDeviceName, host, port, password, mount, icecastUser, bitrate, inputGain } = config;
        const mixMode = config.mixMode === true;

        // I NOMI DISPOSITIVO ARRIVANO ORA DIRETTAMENTE DA DSHOW VIA IPC.
        // NON È PIÙ NECESSARIA NESSUNA PULIZIA REGEX PER COMPENSARE A CHROME.
        const cleanDevice = inputDeviceName;

        const user = icecastUser || 'source';

        // Normalizzazione Mount: Azuracast DJ vuole "/"
        let cleanMount = mount;
        if (!cleanMount || cleanMount === '') cleanMount = '/';

        // Credenziali via header Authorization esplicito: evita problemi di encoding
        // dell'URL con username che contengono @, $ o altri caratteri speciali.
        const creds = Buffer.from(`${user}:${password}`).toString('base64');
        const targetUrl = `http://${host}:${port}${cleanMount}`;

        // Volume input: percentuale → moltiplicatore FFmpeg (es. "150" → "1.5").
        // Range valido 0–200, default 100 (1.0x).
        const gainParsed = parseInt(inputGain ?? '100', 10);
        const gainPct = Number.isFinite(gainParsed) ? Math.max(0, Math.min(200, gainParsed)) : 100;
        const gainMul = (gainPct / 100).toFixed(2);

        // Volume LIVE via azmq: se la porta ZMQ è libera includiamo sempre il filtro
        // `azmq,volume` (con eval=frame così i comandi a caldo hanno effetto immediato)
        // e potremo cambiare il guadagno in diretta senza riavviare l'encoder.
        // Se la porta è occupata, degradiamo al filtro statico (solo se ≠ 100%) — lo
        // stream parte comunque, ma il volume non sarà regolabile live.
        let audioFilter: string | null = null;
        if (mixMode) {
            // In MIX MODE il guadagno è già applicato dal mixer Web Audio del
            // renderer, prima che il PCM arrivi qui: aggiungere azmq/volume
            // significherebbe due controlli in serie sullo stesso volume.
            this.liveVolumeActive = false;
        } else {
            const portFree = await isPortFree(StreamManager.ZMQ_PORT);
            // La porta va ri-verificata dopo l'await: un nuovo start()/stop() nel frattempo
            // ha cambiato currentConfig e questo launch è ormai obsoleto.
            if (this.currentConfig !== config) return false;
            this.liveVolumeActive = portFree;

            if (portFree) {
                // bind_address fra apici: il filtergraph lascia intatti i ':'
                // dell'indirizzo e il filtro toglie l'ultimo livello di '\'
                // (verificato con ffmpeg-static: ascolto su 127.0.0.1 e comando
                // "volume" accettato). Senza indirizzo azmq ascoltava su
                // tcp://*:5555, cioè su tutta la rete locale: chiunque nella LAN
                // poteva mandare "volume 0" e zittire la diretta.
                audioFilter = String.raw`azmq=bind_address='tcp\://127.0.0.1\:${StreamManager.ZMQ_PORT}',volume=eval=frame:volume=${gainMul}`;
            } else {
                audioFilter = gainPct === 100 ? null : `volume=${gainMul}`;
            }
        }

        this.sendStatus('connecting');

        const sourceLabel = mixMode ? 'MIX MODE (microfono + audio di sistema)' : `dshow "${cleanDevice}"`;
        this.log('info', `Connecting → ${host}:${port}${cleanMount} as user="${user}" source=${sourceLabel} gain=${gainPct}% bitrate=${bitrate || '128'}k live-vol=${this.liveVolumeActive ? 'on' : 'off'}`);

        const httpHeaders = `User-Agent: FMLE/3.0\r\nExpect:\r\nIce-Public: 1\r\nAuthorization: Basic ${creds}\r\n`;

        // Registrazione locale (C2): con recordLocal attivo l'output diventa un
        // muxer tee — UN solo encoding, due destinazioni. Lo slave http replica
        // ESATTAMENTE il PUT BUTT-compat (method/headers/chunked passati come
        // opzioni per-slave: quelle globali NON si propagano dentro il tee —
        // verificato headless). Lo slave file ha onfail=ignore: un errore disco
        // interrompe la registrazione ma NON la diretta. Viceversa, un errore di
        // connessione fa uscire FFmpeg come oggi (auto-reconnect invariato).
        let recordPath: string | null = null;
        if (config.recordLocal) {
            try {
                const dir = path.join(app.getPath('documents'), 'StreamFlow');
                fs.mkdirSync(dir, { recursive: true });
                const ts = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
                recordPath = path.join(dir, `RuntimeRadio_${ts}.mp3`);
            } catch (e) {
                this.log('error', `registrazione locale non disponibile (${(e as Error).message}) — lo stream parte comunque`);
                recordPath = null;
            }
        }

        let outputArgs: string[];
        if (recordPath) {
            const httpSlave =
                `[f=mp3:method=PUT:chunked_post=0:content_type=audio/mpeg:headers=${teeEscapeOptionValue(httpHeaders)}]${targetUrl}`;
            const fileSlave = `[f=mp3:onfail=ignore]${teeEscapePath(recordPath)}`;
            outputArgs = ['-map', '0:a', '-f', 'tee', `${httpSlave}|${fileSlave}`];
            this.log('info', `registrazione locale attiva → ${recordPath}`);
        } else {
            outputArgs = [
                '-content_type', 'audio/mpeg',
                '-f', 'mp3',
                '-method', 'PUT',
                '-chunked_post', '0',
                '-headers', httpHeaders,
                targetUrl
            ];
        }

        // MIX MODE: l'input è il PCM che il renderer scrive su stdin (già mixato),
        // non più il singolo device dshow. Tutto il resto della catena — filtri,
        // encoder, tee di registrazione, PUT BUTT-compat — resta identico.
        const inputArgs = mixMode
            ? ['-f', 's16le', '-ar', String(MIX_PCM.sampleRate), '-ac', String(MIX_PCM.channels), '-i', 'pipe:0']
            : ['-f', 'dshow', '-i', `audio=${cleanDevice}`];

        const args = [
            ...inputArgs,
            ...(audioFilter ? ['-af', audioFilter] : []),
            '-acodec', 'libmp3lame',
            '-b:a', `${bitrate || '128'}k`,
            '-ar', '44100',
            ...outputArgs,
        ];

        // NOTA SICUREZZA (audit S2 / L4, rischio accettato e motivato): l'header
        // Authorization viaggia negli argomenti di riga di comando. Su Windows li
        // leggono solo i processi dello STESSO utente (o un amministratore), cioè chi
        // può già decifrare la password memorizzata: DPAPI protegge per utente, non
        // per programma. Nessuna esposizione in più. Le alternative non reggono: il
        // FFmpeg incluso (6.1.1) non ha `-/opzione file` (arriva con la 7.0, e non
        // varrebbe dentro il tee), e un relay locale che aggiunga l'header toccherebbe
        // il cuore della trasmissione. Mitigazioni: windowsHide, mai loggare `args`.
        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        this.ffmpegProcess = proc;
        this.mixInputActive = mixMode;
        this.mixBackpressureLogged = false;
        this.mixBytesWritten = 0;

        // In MIX MODE stdin È la sorgente audio. Quando FFmpeg muore (server caduto,
        // riconnessione, stop) una write già in volo emette EPIPE: senza questo
        // listener l'evento 'error' non gestito abbatterebbe il processo main,
        // cioè l'intera applicazione, in piena diretta.
        proc.stdin?.on('error', () => { /* pipe chiusa: si perde il chunk, non la sessione */ });

        /** true appena c'è un verdetto (errore, primo progresso, stato presunto): ferma il timeout. */
        let connectionConfirmed = false;
        /** FFmpeg ha stampato progresso: dati in uscita, ma il server può ancora rifiutarli. */
        let streamingStarted = false;
        /** Trasmissione continua per CONFIRM_LIVE_MS: è questo, e solo questo, l'ON AIR. */
        let liveConfirmed = false;
        /** Istante del primo byte realmente trasmesso: serve a misurare quanto è durata la diretta. */
        let streamingStartedAt = 0;
        let lastErrorLog = '';
        let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let slowNoticeTimer: ReturnType<typeof setTimeout> | null = null;
        let liveConfirmTimer: ReturnType<typeof setTimeout> | null = null;
        let stableTimer: ReturnType<typeof setTimeout> | null = null;
        /** Chiusura forzata da noi in corso: il resto dello stderr non conta più. */
        let aborting = false;
        /** Causa già nota di una chiusura forzata: prevale sulla lettura dello stderr. */
        let forcedReason: string | null = null;
        /** Istante della chiusura forzata: la diretta è finita lì, non quando arriva il 'close'. */
        let abortedAt = 0;

        const cancelConnectionTimeout = () => {
            if (connectionTimeoutId !== null) {
                clearTimeout(connectionTimeoutId);
                connectionTimeoutId = null;
            }
            if (slowNoticeTimer !== null) {
                clearTimeout(slowNoticeTimer);
                slowNoticeTimer = null;
            }
        };
        let abortKillTimer: ReturnType<typeof setTimeout> | null = null;
        const cancelProcessTimers = () => {
            cancelConnectionTimeout();
            if (liveConfirmTimer !== null) { clearTimeout(liveConfirmTimer); liveConfirmTimer = null; }
            if (stableTimer !== null) { clearTimeout(stableTimer); stableTimer = null; }
            if (abortKillTimer !== null) { clearTimeout(abortKillTimer); abortKillTimer = null; }
        };
        /**
         * Chiude QUESTO processo lasciando il verdetto al suo 'close' (riconnessione
         * o errore, con la stessa logica di ogni altra caduta). killCurrentProcess
         * invece stacca il processo e ne silenzia il 'close'.
         * Arresto pulito, con il kill come riserva: la registrazione locale fatta
         * fin lì va chiusa integra, non persa nel buffer del file.
         */
        const abortProcess = (reason: string | null) => {
            if (aborting) return;
            aborting = true;
            abortedAt = Date.now();
            forcedReason = reason;
            cancelProcessTimers();
            StreamManager.requestExit(proc, mixMode);
            abortKillTimer = setTimeout(() => {
                abortKillTimer = null;
                StreamManager.forceKill(proc);
            }, StreamManager.GRACEFUL_STOP_MS);
        };

        proc.stderr?.on('data', (data) => {
            if (this.ffmpegProcess !== proc || aborting) return; // processo sostituito, fermato o in chiusura

            const message = data.toString();
            // Riga per riga: un blocco di stderr mescola spesso un errore e le righe
            // di progresso, e scartarlo intero (com'era) perdeva proprio la riga con
            // la causa, sia nel file di log sia nella spiegazione dell'uscita.
            // Le righe di progresso (frame=/size=/time=) restano fuori dal file:
            // arrivano ogni mezzo secondo e sommergerebbero le sessioni lunghe.
            const diagnostic = message
                .split(/\r\n|\r|\n/)
                .filter((l: string) => l.trim() && !/frame=|size=|time=/.test(l))
                .join('\n');
            if (diagnostic) {
                lastErrorLog += diagnostic + '\n';
                if (lastErrorLog.length > 2000) lastErrorLog = lastErrorLog.substring(lastErrorLog.length - 2000);
                writeRaw('ffmpeg', diagnostic);
            }

            // Tee (registrazione locale): quando lo slave http (#0) fallisce — in
            // apertura O A DIRETTA AVVIATA — il tee non esce: continua con il solo
            // file. Verificato con ffmpeg-static contro un server che chiude con un
            // reset dopo 2s: "continuing with 1/2 slaves", poi uscita 0 solo a
            // fine input, che in diretta non arriva mai. Fino alla 0.8.6 il messaggio
            // contava solo prima del primo progresso: a diretta avviata l'app restava
            // ON AIR con la radio muta e nessuna riconnessione, e con una password
            // errata tornava l'ON AIR finto della 0.8.4 (il reset arriva a 0,65s,
            // dopo il primo progresso). Si chiude il processo e decide il 'close'.
            if (/Slave muxer #0 failed/i.test(diagnostic)) {
                this.log('error', '✗ la connessione al server si è interrotta (la registrazione locale da sola non è una diretta)');
                abortProcess(null);
                return;
            }
            // Slave file (#1) fallito: registrazione persa ma la diretta continua.
            if (/Slave muxer #1 failed/i.test(diagnostic)) {
                this.log('error', 'registrazione locale interrotta (errore file/disco) — la diretta continua');
                return;
            }

            // Connection error detection (immediate feedback).
            // \b40[134]\b evita falsi positivi tipo "size= 401kB" (nessun word
            // boundary tra la cifra e "kB") che il vecchio includes('401') matchava.
            const CONNECT_ERROR = /Connection refused|Unauthorized|access denied|I\/O error|\b40[134]\b/;
            if (CONNECT_ERROR.test(diagnostic)) {
                if (!connectionConfirmed) {
                    connectionConfirmed = true;
                    cancelConnectionTimeout();
                    const raw = diagnostic.trim().substring(0, 150);
                    // Questo ramo era l'unico a NON scrivere nel log: l'errore finiva
                    // solo nel toast a video, che sparisce da solo. Risultato: il
                    // pannello si fermava su "Connecting" e la causa era irrecuperabile.
                    this.log('error', `✗ ${this.explainConnectError(diagnostic)} — FFmpeg: ${raw}`);
                    // Durante una riconnessione il verdetto spetta al 'close', che
                    // pianifica il tentativo successivo: uno stato 'error' qui
                    // chiuderebbe la sessione mentre il retry è ancora in corso.
                    if (!this.sessionWasLive) this.sendStatus('error', raw);
                }
                return;
            }

            // Progresso (size/time): i dati escono, ma NON è ancora una conferma.
            // Con credenziali errate questa riga arriva comunque, ~0,65s prima del
            // reset: dichiarare ON AIR qui salvava la password sbagliata e azzerava
            // il contatore dei tentativi (riconnessione infinita "1/5").
            if (!streamingStarted && (message.includes('size=') || message.includes('time='))) {
                streamingStarted = true;
                streamingStartedAt = Date.now();
                connectionConfirmed = true;
                cancelConnectionTimeout();
                this.log('info', `audio in uscita verso ${host}:${port}${cleanMount} — verifica tenuta (${StreamManager.CONFIRM_LIVE_MS / 1000}s)...`);

                liveConfirmTimer = setTimeout(() => {
                    liveConfirmTimer = null;
                    if (this.ffmpegProcess !== proc) return; // morto o sostituito nel frattempo
                    liveConfirmed = true;
                    this.sessionWasLive = true;
                    this.log('success', `✓ stream live (audio in transito verso ${host}:${port}${cleanMount})`);
                    this.sendStatus('connected');

                    stableTimer = setTimeout(() => {
                        stableTimer = null;
                        if (this.ffmpegProcess !== proc) return;
                        if (this.reconnectAttempt > 0) {
                            this.log('info', 'diretta stabile da un minuto: contatore delle riconnessioni azzerato');
                        }
                        this.reconnectAttempt = 0;
                    }, StreamManager.STABLE_RESET_MS - StreamManager.CONFIRM_LIVE_MS);
                }, StreamManager.CONFIRM_LIVE_MS);
            }
        });

        proc.on('close', (code) => {
            if (this.ffmpegProcess !== proc) {
                // Stop volontario (stop() ha già azzerato il riferimento) o processo
                // sostituito da un nuovo start: exit code atteso ≠ 0 da taskkill /f,
                // non è un errore e non deve toccare lo stato.
                cancelProcessTimers();
                return;
            }
            cancelProcessTimers();
            this.ffmpegProcess = null;
            this.mixInputActive = false;

            // Ogni uscita che arriva fin qui è imprevista: stop volontario e riavvio
            // staccano il processo prima di ucciderlo. Anche un'uscita "pulita"
            // (codice 0: dshow chiude l'input quando il dispositivo sparisce) è una
            // diretta finita da sola. Fino alla 0.8.6 valeva come chiusura regolare:
            // "Ready" a video, nessun avviso, nessuna riconnessione.
            // Dopo una chiusura chiesta da noi l'uscita pulita è attesa: la causa
            // sta nello stderr già letto (o in forcedReason).
            const cleanExit = (code === 0 || code === null) && !aborting;
            const endedAt = abortedAt || Date.now();
            const liveSeconds = streamingStartedAt ? Math.round((endedAt - streamingStartedAt) / 1000) : 0;
            const { reason: errorReason, credentialsSuspect } = forcedReason !== null
                ? { reason: forcedReason, credentialsSuspect: false }
                : cleanExit
                    ? {
                        reason: 'FFmpeg si è fermato da solo senza errori di rete: la sorgente audio si è interrotta (dispositivo scollegato o disattivato da Windows?)',
                        credentialsSuspect: false,
                    }
                    : classifyExit({
                        lastErrorLog,
                        streamingStarted,
                        liveSeconds,
                        liveConfirmed,
                        sessionWasLive: this.sessionWasLive,
                        port,
                        mount: cleanMount,
                        code: code ?? -1,
                    });

            // Auto-reconnect (Fase C1): solo se in questa sessione la diretta è stata
            // CONFERMATA almeno una volta. Un fallimento al primo collegamento
            // (credenziali/porta/mount sbagliati) è un problema di configurazione:
            // ritentare non lo risolve. Durante una riconnessione, invece, anche un
            // tentativo che fallisce subito (server ancora giù) va ritentato: il
            // numero di tentativi è limitato perché il contatore si azzera solo
            // dopo un minuto di diretta stabile.
            const failedConfig = this.currentConfig;
            if (this.sessionWasLive && failedConfig) {
                this.log('error', `✗ connessione persa: ${errorReason}`);
                this.scheduleReconnect();
            } else {
                this.log('error', `✗ ${errorReason}`);
                this.currentConfig = null;
                this.sessionWasLive = false;
                this.sendStatus('error', `FFmpeg: ${errorReason}`);
                if (credentialsSuspect && failedConfig) {
                    void this.verifyCredentialsAfterDrop(failedConfig);
                }
            }
        });

        proc.on('error', (err) => {
            if (this.ffmpegProcess !== proc) return;
            this.ffmpegProcess = null;
            cancelProcessTimers();
            this.currentConfig = null;
            this.sessionWasLive = false;
            console.error('Failed to start FFmpeg process:', err);
            this.log('error', `✗ avvio FFmpeg fallito: ${err.message}`);
            this.sendStatus('error', `Failed to start: ${err.message}`);
        });

        // Nessuno stato "presunto", in nessuna modalità. Fino alla 0.8.6, senza
        // MIX MODE, dopo 5s di silenzio di FFmpeg si dichiarava ON AIR sulla
        // fiducia: ma FFmpeg rinuncia a un server che non risponde proprio dopo
        // 5s (il suo timeout TCP; misurato 5,5s con la porta chiusa), quindi ogni
        // server irraggiungibile accendeva ON AIR e salvava la password prima
        // dell'errore. ON AIR nasce solo dalla tenuta di CONFIRM_LIVE_MS.
        slowNoticeTimer = setTimeout(() => {
            slowNoticeTimer = null;
            if (this.ffmpegProcess !== proc || connectionConfirmed) return;
            if (!mixMode) {
                this.log('info', `nessuna risposta dopo ${StreamManager.MIX_NO_AUDIO_MS / 1000}s, attendo ancora...`);
                return;
            }
            // MIX MODE: FFmpeg legge da stdin e, se il mixer del renderer non
            // consegna PCM, resta muto in attesa del primo byte. Se il PCM arriva
            // ma il server tarda, si aspetta il verdetto vero di FFmpeg.
            if (this.mixBytesWritten > 0) {
                this.log('info', 'MIX MODE: audio dal mixer ricevuto, in attesa che il server accetti il flusso...');
                return;
            }
            connectionConfirmed = true;
            cancelConnectionTimeout();
            this.log('error', `✗ MIX MODE: dal mixer non è arrivato audio in ${StreamManager.MIX_NO_AUDIO_MS / 1000}s — sessione fermata, in onda non stava andando niente`);
            this.killCurrentProcess();
            this.currentConfig = null;
            this.sessionWasLive = false;
            this.sendStatus('error', 'MIX MODE: il mixer non produce audio, quindi non sei in onda. Controlla microfono e audio di sistema (pannello Log), poi riprova.');
        }, StreamManager.MIX_NO_AUDIO_MS);

        // Se in CONNECT_TIMEOUT_MS non parte niente, il processo si chiude e il
        // verdetto spetta al 'close' (errore al primo collegamento, tentativo
        // successivo durante una riconnessione).
        connectionTimeoutId = setTimeout(() => {
            connectionTimeoutId = null;
            if (this.ffmpegProcess !== proc || connectionConfirmed) return;
            connectionConfirmed = true;
            const s = StreamManager.CONNECT_TIMEOUT_MS / 1000;
            this.log('error', `✗ nessuna trasmissione partita in ${s}s: chiudo il tentativo`);
            abortProcess(`nessuna trasmissione partita in ${s}s: il dispositivo audio non produce segnale, oppure il server non risponde (rete, firewall/antivirus, server spento)`);
        }, StreamManager.CONNECT_TIMEOUT_MS);

        return true;
    }

    /** Pianifica il prossimo tentativo di riconnessione con backoff, countdown a video e log. */
    private scheduleReconnect() {
        const total = StreamManager.RECONNECT_DELAYS_MS.length;
        if (this.reconnectAttempt >= total) {
            this.log('error', `riconnessione fallita dopo ${total} tentativi — stop definitivo`);
            this.sendStatus('error', `Connessione persa: riconnessione fallita dopo ${total} tentativi.`);
            this.reconnectAttempt = 0;
            this.currentConfig = null;
            this.sessionWasLive = false;
            return;
        }

        const delayMs = StreamManager.RECONNECT_DELAYS_MS[this.reconnectAttempt];
        this.reconnectAttempt++;
        const attempt = this.reconnectAttempt;
        let remaining = Math.round(delayMs / 1000);

        const announce = () =>
            this.sendStatus('reconnecting', `Riconnessione tra ${remaining}s (tentativo ${attempt}/${total})`);

        this.log('info', `riconnessione tra ${remaining}s (tentativo ${attempt}/${total})`);
        announce();

        this.countdownTimer = setInterval(() => {
            remaining -= 1;
            if (remaining > 0) announce();
        }, 1000);

        this.reconnectTimer = setTimeout(() => {
            this.cancelReconnect();
            if (!this.currentConfig) return; // stop arrivato durante l'attesa
            this.log('info', `riconnessione in corso (tentativo ${attempt}/${total})...`);
            void this.launch();
        }, delayMs);
    }

    /**
     * Cambia il volume input in DIRETTA (senza riavviare l'encoder) via comando
     * ZMQ al filtro azmq. Aggiorna anche currentConfig così un'eventuale
     * riconnessione riparte dall'ultimo valore impostato.
     * @returns true se applicato live, false se solo memorizzato (stream fermo o
     *          canale live non disponibile → si applicherà al prossimo avvio).
     */
    public async setInputGain(pct: number): Promise<boolean> {
        const clamped = Math.max(0, Math.min(200, Math.round(pct)));
        if (this.currentConfig) {
            this.currentConfig.inputGain = String(clamped);
        }
        const canApplyLive = this.ffmpegProcess !== null && this.liveVolumeActive;
        if (!canApplyLive) return false;

        const mul = (clamped / 100).toFixed(2);
        try {
            await sendFilterCommand(StreamManager.ZMQ_PORT, `all volume ${mul}`);
            return true;
        } catch (e) {
            this.log('error', `volume live non applicato: ${(e as Error).message}`);
            return false;
        }
    }

    /**
     * MIX MODE: inoltra a FFmpeg un blocco di PCM già mixato dal renderer.
     *
     * Silenzioso per costruzione — viene chiamato ~23 volte al secondo e non deve
     * mai diventare una sorgente di rumore nel log: se non c'è un processo che
     * legge (stream fermo, riconnessione in corso) il blocco viene semplicemente
     * scartato, e la diretta riprende dal PCM successivo quando FFmpeg torna su.
     */
    public writeAudioChunk(chunk: Buffer) {
        const proc = this.ffmpegProcess;
        if (!proc || !this.mixInputActive) return;
        const stdin = proc.stdin;
        if (!stdin || stdin.destroyed || !stdin.writable) return;

        // Se FFmpeg non consuma (disco/rete bloccati) il buffer di Node cresce senza
        // limite fino a mangiarsi la RAM. Oltre ~4 MB (≈20s di audio) scartiamo:
        // in diretta l'audio vecchio non serve a nessuno, la memoria sì.
        if (stdin.writableLength > 4 * 1024 * 1024) {
            if (!this.mixBackpressureLogged) {
                this.mixBackpressureLogged = true;
                this.log('error', 'MIX MODE: FFmpeg non sta consumando l\'audio, blocchi scartati (possibile stallo di rete)');
            }
            return;
        }

        try {
            stdin.write(chunk);
            this.mixBytesWritten += chunk.length;
        } catch { /* pipe chiusa tra il controllo e la write */ }
    }

    /**
     * Dopo una caduta con la firma del rifiuto credenziali, chiede al server la
     * risposta che FFmpeg non legge (stesso PUT, client HTTP di Node). Con un 401
     * certo cancella la password memorizzata: altrimenti verrebbe ricaricata a
     * ogni avvio e il DJ ripeterebbe lo stesso errore senza capirne il perché.
     */
    private async verifyCredentialsAfterDrop(config: StreamConfig) {
        const user = config.icecastUser || 'source';
        let auth;
        try {
            auth = await httpAuthCheck({
                host: config.host,
                port: config.port,
                mount: config.mount,
                icecastUser: user,
                password: config.password,
            });
        } catch (e) {
            this.log('error', `verifica credenziali non riuscita: ${(e as Error).message}`);
            return;
        }

        if (auth.status === 401) {
            deletePassword(user);
            this.log('error', `✗ ${auth.text}. La password memorizzata per "${user}" è stata cancellata: reinseriscila in Configurazione.`);
            // Solo se nel frattempo non è partita un'altra sessione: il suo stato
            // non va sovrascritto da un verdetto che riguarda quella precedente.
            if (!this.currentConfig) {
                this.sendStatus('error', `Password rifiutata dal server per "${user}" (401). Reinseriscila in Configurazione.`);
            }
            return;
        }
        const accepted = auth.status !== null && auth.status >= 200 && auth.status < 300;
        this.log(accepted ? 'info' : 'error', `verifica credenziali per "${user}": ${auth.text}`);
    }

    private cancelReconnect() {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.countdownTimer !== null) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
    }

    /**
     * Uccide un processo FFmpeg con i suoi figli.
     * @param sync usare il kill sincrono: necessario in before-quit, dove un exec
     *             asincrono potrebbe non partire mai prima della morte del main
     *             (→ FFmpeg orfano che continua a trasmettere).
     */
    private static forceKill(proc: ChildProcess, sync = false) {
        if (process.platform === 'win32' && proc.pid) {
            // Su Windows, kill() normale spesso lascia orfani. Usiamo taskkill.
            try {
                const cmd = `taskkill /pid ${proc.pid} /f /t`;
                if (sync) {
                    execSync(cmd, { windowsHide: true, stdio: 'ignore' });
                } else {
                    exec(cmd, { windowsHide: true });
                }
            } catch (e) {
                console.error('Taskkill failed:', e);
            }
        } else {
            proc.kill('SIGKILL');
        }
    }

    /**
     * Chiede a FFmpeg di chiudersi da sé, file e connessione compresi. In MIX MODE
     * basta la fine di stdin, cioè l'EOF della sorgente PCM; altrimenti 'q', il
     * comando da tastiera di FFmpeg, che arriva anche da una pipe (verificato con
     * ffmpeg-static: uscita 0 in ~0,1s).
     *
     * Serve alla registrazione locale: il file ha un buffer di 256 KB (misurato),
     * e un taskkill /f lo butta. Si perdono gli ultimi ~11s a 192 kbps, oppure
     * tutta la registrazione di una sessione breve (0 byte dopo 6s di diretta).
     */
    private static requestExit(proc: ChildProcess, mixInput: boolean) {
        try {
            if (mixInput) proc.stdin?.end();
            else proc.stdin?.write('q');
        } catch { /* pipe già chiusa: ci pensa il kill di riserva */ }
    }

    /**
     * Termina il processo corrente senza toccare status/log (usato da start e stop).
     * @param graceful arresto pulito (requestExit), per lo stop chiesto
     *                 dall'utente, con il kill dopo GRACEFUL_STOP_MS come riserva.
     */
    private killCurrentProcess(sync = false, graceful = false) {
        const proc = this.ffmpegProcess;
        if (!proc) return;
        // Azzerare il riferimento PRIMA del kill: i listener del processo morente
        // vedono this.ffmpegProcess !== proc e non alterano lo stato (niente falso
        // 'error' da exit code 1 di taskkill, niente clobber del processo nuovo).
        this.ffmpegProcess = null;
        const wasMix = this.mixInputActive;
        this.mixInputActive = false;

        if (graceful && !sync) {
            StreamManager.requestExit(proc, wasMix);
            this.drainingProcs.add(proc);
            const timer = setTimeout(() => {
                if (this.drainingProcs.delete(proc)) StreamManager.forceKill(proc);
            }, StreamManager.GRACEFUL_STOP_MS);
            proc.once('close', () => {
                clearTimeout(timer);
                this.drainingProcs.delete(proc);
            });
            return;
        }

        // MIX MODE: chiudiamo la sorgente PCM prima di uccidere il processo.
        try { proc.stdin?.end(); } catch { /* già chiusa */ }
        StreamManager.forceKill(proc, sync);
    }

    /** Chiude subito i processi ancora in arresto pulito. */
    private killDraining(sync = false) {
        for (const proc of this.drainingProcs) StreamManager.forceKill(proc, sync);
        this.drainingProcs.clear();
    }

    /**
     * Stop all'uscita dall'app (X confermata durante la diretta): arresto pulito
     * con attesa, poi kill sincrono di quello che resta. Prima l'uscita uccideva
     * FFmpeg all'istante e la registrazione perdeva il suo buffer.
     */
    public async stopForQuit(): Promise<void> {
        this.stop();
        const pending = [...this.drainingProcs];
        if (pending.length > 0) {
            await Promise.race([
                Promise.all(pending.map((p) => new Promise<void>((resolve) => {
                    if (p.exitCode !== null && p.exitCode !== undefined) resolve();
                    else p.once('close', () => resolve());
                }))),
                new Promise<void>((resolve) => setTimeout(resolve, StreamManager.GRACEFUL_STOP_MS)),
            ]);
        }
        this.killDraining(true);
    }

    public stop(sync = false) {
        const wasActive = this.ffmpegProcess !== null || this.reconnectTimer !== null;
        this.cancelReconnect();
        this.reconnectAttempt = 0;
        this.currentConfig = null;
        this.sessionWasLive = false;
        this.liveVolumeActive = false;
        this.killCurrentProcess(sync, !sync);
        if (sync) this.killDraining(true);
        if (wasActive) {
            this.log('info', 'stream fermato');
            this.sendStatus('disconnected');
        }
    }
}
