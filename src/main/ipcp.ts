import { ipcMain, BrowserWindow } from 'electron';
import { StreamManager } from './streaming/ffmpeg-manager';
import { MetadataManager } from './streaming/metadata-manager';
import { savePassword, loadPassword, deletePassword } from './credentials';
import { initFileLogger, writeLog, getLogDir, openLogFolder } from './file-logger';
import { runConnectionDiagnostic, DiagnosticConfig } from './streaming/connection-diagnostic';

let streamManager: StreamManager | null = null;
const metadataManager = new MetadataManager();
/**
 * Il test di connessione trasmette 20s sul mount vero. Mentre gira, una diretta
 * verrebbe rifiutata dal server (sorgente già collegata) e il rifiuto potrebbe
 * passare per una password sbagliata; viceversa un test durante una diretta o una
 * riconnessione le ruberebbe il mount. Il controllo sta qui e non solo nel
 * pannello: chiuso il modale, il pulsante del test tornava cliccabile.
 */
let diagnosticRunning = false;

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

/** Per main.ts: c'è una diretta (o un collegamento/riconnessione) da proteggere? */
export const isStreamSessionActive = () => streamManager?.isSessionActive() ?? false;

/** Per main.ts: eventi di sistema (crash interfaccia) nel pannello e nel file di log. */
export const logSystem = (level: 'info' | 'success' | 'error', message: string) =>
    emitLog(level, 'system', message);

/**
 * Per before-quit: arresto pulito con attesa (registrazione locale integra),
 * chiuso da un kill sincrono — un taskkill asincrono potrebbe non partire mai
 * prima della morte del processo main (FFmpeg orfano che trasmette ancora).
 */
export const shutdownIpc = async () => {
    if (streamManager) {
        await streamManager.stopForQuit();
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

    // Riallineamento dopo un crash: l'interfaccia ricaricata CHIEDE lo stato al
    // montaggio. Una spinta dal main su did-finish-load arrivava prima che React
    // avesse registrato il listener (verificato sulla 0.8.6: "Ready" con la
    // radio in onda, e il pulsante avrebbe avviato una seconda sessione).
    ipcMain.handle('get-stream-status', async () => {
        return streamManager ? streamManager.getStatusSnapshot() : { status: 'disconnected' };
    });

    ipcMain.handle('start-stream', async (_event, config) => {
        if (streamManager && diagnosticRunning) {
            streamManager.refuseStart('Test connessione in corso sullo stesso canale: attendi che finisca (circa 20 secondi), poi vai in onda.');
            return;
        }
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

    // MIX MODE: flusso PCM dal mixer del renderer verso stdin di FFmpeg.
    // `on` e non `handle`: arriva ~23 volte al secondo per tutta la diretta e non
    // serve nessuna risposta — un invoke pagherebbe un round-trip a ogni blocco.
    ipcMain.on('mix-audio-chunk', (_event, data: Uint8Array) => {
        if (!streamManager || !(data instanceof Uint8Array)) return;
        streamManager.writeAudioChunk(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
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

    // D2: diagnostica attiva. Occupa il mount per una ventina di secondi, quindi
    // il renderer disabilita il pulsante mentre una sessione è in corso.
    ipcMain.handle('run-connection-test', async (_event, config: DiagnosticConfig) => {
        if (diagnosticRunning) {
            return { ok: false, summary: 'test connessione già in corso' };
        }
        if (streamManager?.isSessionActive()) {
            const summary = 'test connessione non avviato: c\'è una sessione di trasmissione attiva (diretta, collegamento o riconnessione) e il test le toglierebbe il canale';
            emitLog('error', 'system', summary);
            return { ok: false, summary };
        }
        diagnosticRunning = true;
        try {
            return await runConnectionDiagnostic(config, (level, message) =>
                emitLog(level, 'system', message),
            );
        } finally {
            diagnosticRunning = false;
        }
    });

    // Eventi nati nel renderer (MIX MODE): nel pannello arrivano già, qui vanno
    // nel file di log, l'unica traccia che un DJ può allegare. Fino alla 0.8.6
    // la modalità dei DJ senza mixer era proprio quella che non ne lasciava.
    ipcMain.on('renderer-log', (_event, level: unknown, message: unknown) => {
        if (typeof message !== 'string') return;
        const lvl = level === 'error' || level === 'success' ? level : 'info';
        writeLog('system', lvl, message.substring(0, 2000));
    });
};
