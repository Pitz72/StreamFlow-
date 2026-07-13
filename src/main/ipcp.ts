import { ipcMain, BrowserWindow } from 'electron';
import { StreamManager } from './streaming/ffmpeg-manager';
import { MetadataManager } from './streaming/metadata-manager';
import { fetchStations, fetchStationDetail } from './azuracast/azuracast-api';

let streamManager: StreamManager | null = null;
const metadataManager = new MetadataManager();

// Finestra correntemente collegata: aggiornata a ogni initializeIpc così i log
// raggiungono sempre la finestra viva (su macOS activate ne può nascere una nuova).
let boundWindow: BrowserWindow | null = null;
let handlersRegistered = false;

const emitLog = (level: 'info' | 'success' | 'error', source: 'stream' | 'metadata' | 'system', message: string) => {
    if (!boundWindow || boundWindow.isDestroyed()) return;
    try {
        boundWindow.webContents.send('LOG_EVENT', { level, source, message });
    } catch { /* finestra in chiusura */ }
};

export const cleanupIpc = () => {
    if (streamManager) {
        // sync=true: siamo in before-quit, un taskkill asincrono potrebbe non
        // partire mai prima della morte del processo main (FFmpeg orfano).
        streamManager.stop(true);
        streamManager = null;
    }
    metadataManager.clearConfig();
};

/**
 * Idempotente: gli handler ipcMain vengono registrati una sola volta;
 * la finestra (StreamManager, log sink, evento iniziale) viene ricollegata
 * a ogni chiamata. Va invocata per ogni BrowserWindow creata.
 */
export const initializeIpc = (mainWindow: BrowserWindow) => {
    boundWindow = mainWindow;

    if (!streamManager) {
        streamManager = new StreamManager(mainWindow);
    } else {
        streamManager.setMainWindow(mainWindow);
    }

    metadataManager.setLogSink((level, msg) => emitLog(level, 'metadata', msg));
    streamManager.setLogSink((level, msg) => emitLog(level, 'stream', msg));

    // Evento iniziale: rende la barra log immediatamente visibile e conferma l'IPC up.
    // Atteso che la finestra abbia finito di caricare, altrimenti il send va perso.
    mainWindow.webContents.once('did-finish-load', () => {
        emitLog('info', 'system', `StreamFlow pronto — in attesa di eventi.`);
    });

    if (handlersRegistered) return;
    handlersRegistered = true;

    ipcMain.handle('start-stream', async (_event, config) => {
        if (streamManager) {
            const started = streamManager.start(config);
            // Config metadata solo se lo stream è effettivamente partito:
            // altrimenti "Invia" sembrerebbe funzionante senza stream attivo.
            if (started) {
                metadataManager.setConfig({
                    host: config.host,
                    port: config.port,
                    user: config.icecastUser || 'source',
                    password: config.password,
                    mount: config.mount,
                });
            }
        }
    });

    ipcMain.handle('stop-stream', async () => {
        if (streamManager) {
            streamManager.stop();
        }
        metadataManager.clearConfig();
    });

    ipcMain.handle('get-audio-devices', async () => {
        return await StreamManager.getWindowsAudioDevices();
    });

    ipcMain.handle('update-metadata', async (_event, { artist, title }: { artist: string; title: string }) => {
        const result = await metadataManager.send(artist, title);
        return {
            ok: result.ok,
            error: result.error,
            httpStatus: result.httpStatus,
            requestLine: result.requestLine,
            rawResponse: result.rawResponse,
        };
    });

    ipcMain.handle('azuracast-fetch-stations', async (_event, { url, apiKey }: { url: string; apiKey: string }) => {
        try {
            const stations = await fetchStations(url, apiKey);
            return { ok: true, stations };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });

    ipcMain.handle('azuracast-fetch-station-detail', async (_event, { url, apiKey, stationId }: { url: string; apiKey: string; stationId: number }) => {
        try {
            const detail = await fetchStationDetail(url, apiKey, stationId);
            return { ok: true, detail };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });
};
