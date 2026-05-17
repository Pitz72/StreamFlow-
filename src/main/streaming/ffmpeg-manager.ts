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

export class StreamManager {
    private ffmpegProcess: ChildProcess | null = null;
    private mainWindow: BrowserWindow | null = null;

    constructor(mainWindow: BrowserWindow | null) {
        this.mainWindow = mainWindow;
    }

    public setMainWindow(window: BrowserWindow) {
        this.mainWindow = window;
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

    private sendStatus(status: 'connecting' | 'connected' | 'error' | 'disconnected', message?: string) {
        if (this.mainWindow) {
            this.mainWindow.webContents.send('STREAM_STATUS', status, message);
        }
    }

    public start(config: StreamConfig) {
        // Stop preventivo aggressivo
        this.stop();

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
        const gainPct = Math.max(0, Math.min(200, parseInt(inputGain || '100', 10) || 100));
        const audioFilter = gainPct === 100 ? null : `volume=${(gainPct / 100).toFixed(2)}`;

        this.sendStatus('connecting');

        console.log(`[StreamManager] Connecting → ${host}:${port}${cleanMount} as user="${user}" gain=${gainPct}%`);

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

        this.ffmpegProcess = spawn(ffmpegPath, args);

        if (this.ffmpegProcess.stderr) {
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

            this.ffmpegProcess.stderr.on('data', (data) => {
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
                    if (!connectionConfirmed) {
                        connectionConfirmed = true;
                        cancelConnectionTimeout();
                        this.sendStatus('connected');
                    }
                }
            });

            this.ffmpegProcess.on('close', (code) => {
                cancelConnectionTimeout();
                this.ffmpegProcess = null;
                if (code !== 0 && code !== null) {
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
                    this.sendStatus('error', `FFmpeg: ${errorReason}`);
                } else {
                    this.sendStatus('disconnected');
                }
            });

            // Safety timeout: se nessun output stderr conferma lo stato entro 5s e il processo è vivo,
            // assumiamo connessione avvenuta (handshake lento o server silenzioso).
            // Viene cancellato immediatamente se arriva conferma o errore da stderr.
            connectionTimeoutId = setTimeout(() => {
                if (this.ffmpegProcess && !this.ffmpegProcess.killed && !connectionConfirmed) {
                    connectionConfirmed = true;
                    this.sendStatus('connected');
                }
            }, 5000);
        }

        this.ffmpegProcess.on('error', (err) => {
            console.error('Failed to start FFmpeg process:', err);
            this.sendStatus('error', `Failed to start: ${err.message}`);
        });
    }

    public stop() {
        if (this.ffmpegProcess) {
            // Su Windows, kill() normale spesso lascia orfani. Usiamo taskkill.
            if (process.platform === 'win32' && this.ffmpegProcess.pid) {
                try {
                    exec(`taskkill /pid ${this.ffmpegProcess.pid} /f /t`);
                } catch (e) {
                    console.error('Taskkill failed:', e);
                }
            } else {
                this.ffmpegProcess.kill('SIGKILL');
            }
            this.ffmpegProcess = null;
            this.sendStatus('disconnected');
        }
    }
}
