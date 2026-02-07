import { spawn, ChildProcess } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { BrowserWindow } from 'electron';

interface StreamConfig {
    inputDeviceName: string;
    host: string;
    port: string;
    password: string;
    mount: string;
    icecastUser?: string;
    bitrate?: string;
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

    private sendStatus(status: 'connecting' | 'connected' | 'error' | 'disconnected', message?: string) {
        if (this.mainWindow) {
            this.mainWindow.webContents.send('STREAM_STATUS', status, message);
        }
    }

    public start(config: StreamConfig) {
        if (this.ffmpegProcess) {
            console.log('Stream already running, stopping first...');
            this.stop();
        }

        const { inputDeviceName, host, port, password, mount, icecastUser, bitrate = '128' } = config;

        // 1. PULIZIA NOME DEVICE (Windows dshow fix)
        // Adapted regex from user snippet + preserving previous robust ones if needed.
        // User snippet: .replace(/^(Default|Communications) - /, '')
        let cleanDevice = inputDeviceName
            .replace(/^(Communications|Default) - /, '')
            .replace(/\s\([0-9a-fA-F]{4}:[0-9a-fA-F]{4}\)$/, '');

        // 2. PROTOCOLLO HTTP PUT (BUTT Emulation)
        const user = icecastUser || 'source';
        const safeUser = encodeURIComponent(user);
        const safePass = encodeURIComponent(password);

        // Costruiamo l'URL HTTP.
        // NOTA: Se il mount è "/" o vuoto, assicuriamo che ci sia almeno lo slash finale.
        const cleanMount = (mount === '' || mount === '/') ? '/' : mount;
        const targetUrl = `http://${safeUser}:${safePass}@${host}:${port}${cleanMount}`;

        // Log per debug (mascherato)
        console.log(`[StreamManager] MODE: HTTP PUT (BUTT Emulation)`);
        console.log(`[StreamManager] Device Cleaned: "${cleanDevice}"`);
        const logUrl = `http://${safeUser}:***@${host}:${port}${cleanMount}`;
        console.log(`[StreamManager] Target URL: ${logUrl}`);

        this.sendStatus('connecting');

        const args = [
            '-f', 'dshow',
            '-i', `audio=${cleanDevice}`,
            '-acodec', 'libmp3lame',
            '-ab', `${bitrate}k`,
            '-content_type', 'audio/mpeg', // Header fondamentale per HTTP
            '-f', 'mp3',
            '-method', 'PUT',              // Metodo fondamentale per HTTP
            targetUrl
        ];

        console.log('Spawning FFmpeg:', ffmpegPath, args.join(' '));

        if (!ffmpegPath) {
            this.sendStatus('error', 'FFmpeg binary not found');
            return;
        }

        this.ffmpegProcess = spawn(ffmpegPath, args);

        if (this.ffmpegProcess.stderr) {
            this.ffmpegProcess.stderr.on('data', (data) => {
                const message = data.toString();
                // User logic: Filtriamo i log troppo verbosi
                if (!message.includes('frame=') && !message.includes('size=')) {
                    console.log('FFmpeg stderr:', message);
                }

                // Restore connection detection logic
                if (message.includes('Connection established') || message.includes('Writing audio frame')) {
                    // Success detection could go here
                }

                if (message.includes('Connection refused') || message.includes('401 Unauthorized') || message.includes('I/O error')) {
                    this.sendStatus('error', `Connection Error: ${message.substr(0, 100)}...`);
                    this.stop();
                }
            });
        }

        // Se il processo non crasha entro 2 secondi, assumiamo "connected"
        setTimeout(() => {
            if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
                this.sendStatus('connected');
            }
        }, 2000);

        this.ffmpegProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
            this.ffmpegProcess = null;
            if (code !== 0 && code !== null) { // code is null if killed by signal
                this.sendStatus('error', `Exited with code ${code}`);
            } else {
                this.sendStatus('disconnected');
            }
        });

        this.ffmpegProcess.on('error', (err) => {
            console.error('Failed to start FFmpeg process:', err);
            this.sendStatus('error', `Failed to start: ${err.message}`);
        });
    }

    public stop() {
        if (this.ffmpegProcess) {
            console.log('Stopping FFmpeg process...');
            this.ffmpegProcess.kill('SIGINT'); // Try graceful stop first
            this.ffmpegProcess = null;
            this.sendStatus('disconnected');
        }
    }
}
