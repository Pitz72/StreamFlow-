import { ipcMain, BrowserWindow } from 'electron';
import { StreamManager } from './streaming/ffmpeg-manager';
import { MetadataManager } from './streaming/metadata-manager';
import { savePassword, loadPassword, deletePassword } from './credentials';
import { initFileLogger, writeLog, getLogDir, openLogFolder } from './file-logger';

let streamManager: StreamManager | null = null;
const metadataManager = new MetadataManager();

// Finestra correntemente collegata: aggiornata a ogni initializeIpc così i log
// raggiungono sempre la finestra viva (su macOS activate ne può nascere una nuova).
let boundWindow: BrowserWindow | null = null;
let handlersRegistered = false;

const emitLog = (level: 'info' | 'success' | 'error', source: 'stream' | 'metadata' | 'system', message: string) => {
    // Su file PRIMA che a video: il pannello tiene 50 eventi in memoria e muore
    // con l'app, il file no. È l'unica traccia che un utente può allegare.
    writeLog(source, level, message);
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

    const fileLogOk = initFileLogger();

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
        emitLog(
            fileLogOk ? 'info' : 'error',
            'system',
            fileLogOk
                ? `log su file attivo → ${getLogDir()}`
                : 'log su file NON disponibile (cartella Documenti non scrivibile)',
        );
    });

    if (handlersRegistered) return;
    handlersRegistered = true;

    ipcMain.handle('start-stream', async (_event, config) => {
        if (streamManager) {
            const started = await streamManager.start(config);
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

    ipcMain.handle('set-input-gain', async (_event, pct: number) => {
        if (!streamManager) return { appliedLive: false };
        const appliedLive = await streamManager.setInputGain(pct);
        return { appliedLive };
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

    // Memoria password DJ (cifrata via safeStorage, file in userData)
    ipcMain.handle('dj-password-save', async (_event, { username, password }: { username: string; password: string }) => {
        return { ok: savePassword(username, password) };
    });

    ipcMain.handle('dj-password-load', async (_event, { username }: { username: string }) => {
        return { password: loadPassword(username) };
    });

    ipcMain.handle('dj-password-delete', async (_event, { username }: { username: string }) => {
        deletePassword(username);
    });

    ipcMain.handle('open-log-folder', async () => {
        const dir = await openLogFolder();
        return { ok: dir !== null, dir };
    });
};
