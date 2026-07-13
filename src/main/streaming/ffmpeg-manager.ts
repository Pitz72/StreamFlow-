import { spawn, ChildProcess, exec } from 'child_process';
import ffmpegPathRaw from 'ffmpeg-static';
import { BrowserWindow } from 'electron';

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
}

type StreamStatus = 'connecting' | 'connected' | 'error' | 'disconnected' | 'reconnecting';

export class StreamManager {
    /** Backoff riconnessione: 5s → 10s → 30s → 60s → 120s, poi stop definitivo. */
    private static readonly RECONNECT_DELAYS_MS = [5000, 10000, 30000, 60000, 120000];

    private ffmpegProcess: ChildProcess | null = null;
    private mainWindow: BrowserWindow | null = null;
    private logSink: ((level: 'info' | 'success' | 'error', msg: string) => void) | null = null;

    /** Config dell'ultimo start richiesto dall'utente — serve ai retry. null = nessuna sessione attiva. */
    private currentConfig: StreamConfig | null = null;
    private reconnectAttempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private countdownTimer: ReturnType<typeof setInterval> | null = null;

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

    public static async getWindowsAudioDevices(): Promise<string[]> {
        return new Promise((resolve) => {
            if (process.platform !== 'win32' || !ffmpegPath) {
                resolve([]);
                return;
            }

            const getDevices = spawn(ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
            const devices: string[] = [];
            let outputBuffer = '';

            getDevices.stderr?.on('data', (data) => {
                outputBuffer += data.toString();
            });

            getDevices.on('close', () => {
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
                resolve(devices);
            });

            getDevices.on('error', () => {
                resolve([]);
            });
        });
    }

    private sendStatus(status: StreamStatus, message?: string) {
        // La finestra può essere già distrutta (quit mentre si è ON AIR):
        // inviare su webContents distrutto lancia "Object has been destroyed".
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        try {
            this.mainWindow.webContents.send('STREAM_STATUS', status, message);
        } catch { /* finestra in chiusura */ }
    }

    public start(config: StreamConfig) {
        // Nuovo start richiesto dall'utente: annulla eventuali retry pendenti e
        // termina il processo corrente. I listener del vecchio processo si
        // auto-disattivano tramite il guard di identità (this.ffmpegProcess !== proc).
        this.cancelReconnect();
        this.reconnectAttempt = 0;
        this.killCurrentProcess();
        this.currentConfig = config;
        this.launch();
    }

    /**
     * Avvia (o riavvia, in caso di retry) FFmpeg con la config corrente.
     * Tutti i listener del processo controllano `this.ffmpegProcess === proc`
     * prima di toccare lo stato condiviso: un processo sostituito o fermato
     * dall'utente non può più alterare status/riferimenti (era la race che
     * produceva stream orfani e falsi stati di errore).
     */
    private launch() {
        const config = this.currentConfig;
        if (!config) return;

        const { inputDeviceName, host, port, password, mount, icecastUser, bitrate, inputGain } = config;

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
        // Range valido 0–200, default 100 (1.0x). Solo se diverso da 100 inseriamo
        // il filtro per evitare la pipeline di filtraggio quando non serve.
        const gainParsed = parseInt(inputGain ?? '100', 10);
        const gainPct = Number.isFinite(gainParsed) ? Math.max(0, Math.min(200, gainParsed)) : 100;
        const audioFilter = gainPct === 100 ? null : `volume=${(gainPct / 100).toFixed(2)}`;

        this.sendStatus('connecting');

        this.log('info', `Connecting → ${host}:${port}${cleanMount} as user="${user}" gain=${gainPct}% bitrate=${bitrate || '128'}k`);

        const args = [
            '-f', 'dshow',
            '-i', `audio=${cleanDevice}`,
            ...(audioFilter ? ['-af', audioFilter] : []),
            '-acodec', 'libmp3lame',
            '-ab', `${bitrate || '128'}k`,
            '-ar', '44100',
            '-content_type', 'audio/mpeg',
            '-f', 'mp3',
            '-method', 'PUT',
            '-chunked_post', '0',
            '-headers', `User-Agent: FMLE/3.0\r\nExpect:\r\nIce-Public: 1\r\nAuthorization: Basic ${creds}\r\n`,
            targetUrl
        ];

        if (!ffmpegPath) {
            this.sendStatus('error', 'FFmpeg binary not found');
            return;
        }

        const proc = spawn(ffmpegPath, args);
        this.ffmpegProcess = proc;

        let connectionConfirmed = false;
        let streamingStarted = false;
        let lastErrorLog = '';
        let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;

        const cancelConnectionTimeout = () => {
            if (connectionTimeoutId !== null) {
                clearTimeout(connectionTimeoutId);
                connectionTimeoutId = null;
            }
        };

        proc.stderr?.on('data', (data) => {
            if (this.ffmpegProcess !== proc) return; // processo sostituito o stop volontario

            const message = data.toString();
            // Salviamo le ultime righe per un traceback se dovesse crashare
            if (!message.includes('frame=') && !message.includes('size=') && !message.includes('time=')) {
                lastErrorLog += message;
                if (lastErrorLog.length > 2000) lastErrorLog = lastErrorLog.substring(lastErrorLog.length - 2000);
            }

            // Connection error detection (immediate feedback)
            if (message.includes('Connection refused') ||
                message.includes('401') ||
                message.includes('403') ||
                message.includes('404') ||
                message.includes('Unauthorized') ||
                message.includes('access denied') ||
                message.includes('I/O error')) {
                if (!connectionConfirmed) {
                    connectionConfirmed = true;
                    cancelConnectionTimeout();
                    this.sendStatus('error', message.trim().substring(0, 150));
                }
                return;
            }

            // Connection success: FFmpeg reports progress (size/time) only when actively streaming
            if (message.includes('size=') || message.includes('time=')) {
                streamingStarted = true;
                // Stream sano: un eventuale drop futuro riparte dal primo tentativo di retry.
                this.reconnectAttempt = 0;
                if (!connectionConfirmed) {
                    connectionConfirmed = true;
                    cancelConnectionTimeout();
                    this.log('success', `✓ stream live (audio in transito verso ${host}:${port}${cleanMount})`);
                    this.sendStatus('connected');
                }
            }
        });

        proc.on('close', (code) => {
            if (this.ffmpegProcess !== proc) {
                // Stop volontario (stop() ha già azzerato il riferimento) o processo
                // sostituito da un nuovo start: exit code atteso ≠ 0 da taskkill /f,
                // non è un errore e non deve toccare lo stato.
                cancelConnectionTimeout();
                return;
            }
            cancelConnectionTimeout();
            this.ffmpegProcess = null;

            if (code === 0 || code === null) {
                this.log('info', 'stream chiuso correttamente');
                this.sendStatus('disconnected');
                return;
            }

            const errorLines = lastErrorLog.split('\n').map(l => l.trim()).filter(l => l);
            // Priorità alla prima riga che contiene un errore riconoscibile
            // (es. "401", "Connection refused") — le ultime righe sono spesso
            // cleanup noise di FFmpeg (Error muxing, Error writing trailer, ecc.)
            const HTTP_ERROR = /\b(40[0-9]|Connection refused|Unauthorized|access denied|No route|Name or service)\b/i;
            const firstMeaningful = errorLines.find(l => HTTP_ERROR.test(l));

            // Pattern "harbor occupied / wrong port": auth accettata, poi RST
            // immediato dal server senza che lo streaming sia mai partito.
            // Sintomi: -10053 / WSAECONNABORTED / "Error muxing" e mai un "time="
            const dropPattern = /(10053|WSAECONNABORTED|Error muxing|Connection reset)/i;
            const earlyDrop = !streamingStarted && dropPattern.test(lastErrorLog);

            let errorReason: string;
            if (earlyDrop) {
                errorReason = `Server ha chiuso la connessione subito dopo l'auth. Probabile causa: mount/porta sbagliati (stai puntando a Icecast invece che al harbor Liquidsoap?). Verifica che porta=${port} e mount=${cleanMount} corrispondano a "Icecast Clients" nel pannello AzuraCast → Broadcasting → How do I connect?`;
            } else if (firstMeaningful) {
                errorReason = firstMeaningful.substring(0, 200);
            } else {
                errorReason = errorLines.slice(-3).join(' | ') || `Exited with code ${code}`;
            }

            // Auto-reconnect (Fase C1): solo se lo streaming era realmente partito.
            // Un fallimento al primo connect (credenziali/porta/mount sbagliati) è un
            // problema di configurazione: ritentare 5 volte non lo risolve.
            if (streamingStarted && this.currentConfig) {
                this.log('error', `✗ connessione persa: ${errorReason}`);
                this.scheduleReconnect();
            } else {
                this.log('error', `✗ ${errorReason}`);
                this.sendStatus('error', `FFmpeg: ${errorReason}`);
            }
        });

        proc.on('error', (err) => {
            if (this.ffmpegProcess !== proc) return;
            this.ffmpegProcess = null;
            cancelConnectionTimeout();
            console.error('Failed to start FFmpeg process:', err);
            this.log('error', `✗ avvio FFmpeg fallito: ${err.message}`);
            this.sendStatus('error', `Failed to start: ${err.message}`);
        });

        // Safety timeout: se nessun output stderr conferma lo stato entro 5s e il processo è vivo,
        // assumiamo connessione avvenuta (handshake lento o server silenzioso).
        // Viene cancellato immediatamente se arriva conferma o errore da stderr.
        connectionTimeoutId = setTimeout(() => {
            if (this.ffmpegProcess === proc && !proc.killed && !connectionConfirmed) {
                connectionConfirmed = true;
                this.sendStatus('connected');
            }
        }, 5000);
    }

    /** Pianifica il prossimo tentativo di riconnessione con backoff, countdown a video e log. */
    private scheduleReconnect() {
        const total = StreamManager.RECONNECT_DELAYS_MS.length;
        if (this.reconnectAttempt >= total) {
            this.log('error', `riconnessione fallita dopo ${total} tentativi — stop definitivo`);
            this.sendStatus('error', `Connessione persa: riconnessione fallita dopo ${total} tentativi.`);
            this.reconnectAttempt = 0;
            this.currentConfig = null;
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
            this.launch();
        }, delayMs);
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

    /** Termina il processo corrente senza toccare status/log (usato da start e stop). */
    private killCurrentProcess() {
        const proc = this.ffmpegProcess;
        if (!proc) return;
        // Azzerare il riferimento PRIMA del kill: i listener del processo morente
        // vedono this.ffmpegProcess !== proc e non alterano lo stato (niente falso
        // 'error' da exit code 1 di taskkill, niente clobber del processo nuovo).
        this.ffmpegProcess = null;
        if (process.platform === 'win32' && proc.pid) {
            // Su Windows, kill() normale spesso lascia orfani. Usiamo taskkill.
            try {
                exec(`taskkill /pid ${proc.pid} /f /t`);
            } catch (e) {
                console.error('Taskkill failed:', e);
            }
        } else {
            proc.kill('SIGKILL');
        }
    }

    public stop() {
        const wasActive = this.ffmpegProcess !== null || this.reconnectTimer !== null;
        this.cancelReconnect();
        this.reconnectAttempt = 0;
        this.currentConfig = null;
        this.killCurrentProcess();
        if (wasActive) {
            this.log('info', 'stream fermato');
            this.sendStatus('disconnected');
        }
    }
}
