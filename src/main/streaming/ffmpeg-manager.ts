import { spawn, ChildProcess } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { BrowserWindow } from 'electron';

interface StreamConfig {
    inputDeviceName: string;
    host: string;
    port: string;
    password: string;
    mount: string;
    bitrate?: string; // e.g., '128'
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

        const { inputDeviceName, host, port, password, mount, bitrate = '128' } = config;
        const icecastUrl = `icecast://source:${password}@${host}:${port}${mount}`;

        console.log(`Starting stream with device: ${inputDeviceName} to ${host}:${port}${mount}`);
        this.sendStatus('connecting');

        // Argomenti FFmpeg per Windows (dshow)
        // Nota: Se inputDeviceName è 'default', ffmpeg potrebbe aver bisogno del nome reale. 
        // L'UI dovrebbe mandare il nome reale. Se manda 'default', qui dovremmo gestire un fallback o errore.
        // Assumiamo che il frontend mandi il nome corretto o che 'audio="default"' funzioni (su windows dshow spesso vuole il nome esatto).
        // Se il deviceId è un ID hash (dal browser), non funzionerà direttamente con dshow.
        // TODO: Mappare deviceId browser -> deviceName dshow se necessario. 
        // Per ora proviamo a passare il label come nome device.

        let deviceName = inputDeviceName;
        // Basic cleanup for dshow names if needed

        const args = [
            '-f', 'dshow',
            '-i', `audio=${deviceName}`,
            '-acodec', 'libmp3lame',
            '-ab', `${bitrate}k`,
            '-content_type', 'audio/mpeg',
            '-f', 'mp3',
            icecastUrl
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
                console.log('FFmpeg stderr:', message);

                // Heuristics to detect connection success/failure
                if (message.includes('Connection established') || message.includes('Writing audio frame')) {
                    // This might be too spammy if "Writing audio frame" appears often. 
                    // Ideally look for "Icecast connection established" or similar info message.
                    // Or just assume connected if process doesn't exit immediately.
                    // Let's rely on not crashing + "Connection established" if visible.
                    // Actually standard ffmpeg output for icecast success isn't always explicit "Connected".
                    // But let's look for common errors.
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
