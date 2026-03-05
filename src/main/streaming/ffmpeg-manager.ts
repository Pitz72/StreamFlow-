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

        const { inputDeviceName, host, port, password, mount, icecastUser } = config;

        // I NOMI DISPOSITIVO ARRIVANO ORA DIRETTAMENTE DA DSHOW VIA IPC.
        // NON È PIÙ NECESSARIA NESSUNA PULIZIA REGEX PER COMPENSARE A CHROME.
        const cleanDevice = inputDeviceName;

        // 2. CONFIGURAZIONE HTTP RAW
        const user = icecastUser || 'source';
        const safeUser = encodeURIComponent(user);
        const safePass = encodeURIComponent(password);

        // Normalizzazione Mount: Azuracast DJ vuole "/"
        let cleanMount = mount;
        if (!cleanMount || cleanMount === '') cleanMount = '/';

        const targetUrl = `http://${safeUser}:${safePass}@${host}:${port}${cleanMount}`;
        // Mascheriamo la password per il log
        const logUrl = `http://${safeUser}:***@${host}:${port}${cleanMount}`;

        console.log(`[StreamManager] Starting Stream (HTTP RAW + Header Fix)`);
        console.log(`[StreamManager] Device: "${cleanDevice}"`);
        console.log(`[StreamManager] Target: ${logUrl}`);

        this.sendStatus('connecting');

        const args = [
            '-f', 'dshow',
            '-i', `audio=${cleanDevice}`,
            '-acodec', 'libmp3lame',
            '-ab', '128k',
            '-ar', '44100',                 // Sample rate fisso
            '-content_type', 'audio/mpeg',
            '-f', 'mp3',
            '-method', 'PUT',               // Metodo HTTP
            '-chunked_post', '0',           // Disabilita chunking
            // FIX CRUCIALE: Rimuove "Expect" (mettendo valore vuoto) e imposta User-Agent
            '-headers', 'User-Agent: FMLE/3.0\r\nExpect:\r\nIce-Public: 1\r\n',
            targetUrl
        ];

        console.log('Spawning FFmpeg:', ffmpegPath, args.join(' '));

        if (!ffmpegPath) {
            this.sendStatus('error', 'FFmpeg binary not found');
            return;
        }

        this.ffmpegProcess = spawn(ffmpegPath, args);

        if (this.ffmpegProcess.stderr) {
            let connectionConfirmed = false;
            let lastErrorLog = '';

            this.ffmpegProcess.stderr.on('data', (data) => {
                const message = data.toString();
                // Salviamo le ultime righe per un traceback se dovesse crashare
                if (!message.includes('frame=') && !message.includes('size=') && !message.includes('time=')) {
                    console.log(`FFmpeg: ${message.trim()}`);
                    lastErrorLog += message;
                    if (lastErrorLog.length > 2000) lastErrorLog = lastErrorLog.substring(lastErrorLog.length - 2000);
                }

                // Connection error detection (immediate feedback)
                if (message.includes('Connection refused') || message.includes('401 Unauthorized') || message.includes('I/O error')) {
                    connectionConfirmed = true;
                    this.sendStatus('error', message.trim().substring(0, 150));
                    return;
                }

                // Connection success: FFmpeg reports progress (size/time) only when actively streaming
                if (!connectionConfirmed && (message.includes('size=') || message.includes('time='))) {
                    connectionConfirmed = true;
                    this.sendStatus('connected');
                }
            });

            this.ffmpegProcess.on('close', (code) => {
                console.log(`[StreamManager] Process exited with code ${code}`);
                this.ffmpegProcess = null;
                if (code !== 0 && code !== null) { // code is null if killed by signal
                    // Estraiamo le ultime 3 righe per prendere l'errore reale, ad es. "Connection reset" + "Conversion failed"
                    const errorLines = lastErrorLog.split('\n').map(l => l.trim()).filter(l => l);
                    const errorReason = errorLines.slice(-3).join(' | ');
                    this.sendStatus('error', `FFmpeg Crash: ${errorReason || 'Exited with code ' + code}`);
                } else {
                    this.sendStatus('disconnected');
                }
            });
        }

        // Safety timeout: if no stderr output confirms status after 5s, check if process is alive
        setTimeout(() => {
            if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
                // Process alive but no confirmation yet — likely buffering or slow handshake
                this.sendStatus('connected');
            }
        }, 5000);

        this.ffmpegProcess.on('error', (err) => {
            console.error('Failed to start FFmpeg process:', err);
            this.sendStatus('error', `Failed to start: ${err.message}`);
        });
    }

    public stop() {
        if (this.ffmpegProcess) {
            console.log('[StreamManager] Killing process tree...');
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
