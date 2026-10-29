import { app, ipcMain, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

/**
 * Aggiornamento automatico dalle release GitHub di Pitz72/StreamFlow-.
 *
 * Le release nascono solo a mano (workflow "Build & Release" lanciato dal sito):
 * un push non pubblica niente, quindi non arriva niente ai DJ.
 *
 * Una diretta non va mai toccata: l'installazione parte solo alla chiusura di
 * StreamFlow (silenziosa, l'app non si riapre da sola), oppure con "Aggiorna ora"
 * che il main rifiuta se c'è una sessione attiva. Durante una sessione non si
 * cercano nemmeno aggiornamenti nuovi.
 */

export type UpdateState =
    | { state: 'idle' }
    | { state: 'downloading'; version: string }
    | { state: 'ready'; version: string };

const FIRST_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let current: UpdateState = { state: 'idle' };
let boundWindow: BrowserWindow | null = null;
let started = false;

const publish = (next: UpdateState) => {
    current = next;
    if (!boundWindow || boundWindow.isDestroyed()) return;
    try {
        boundWindow.webContents.send('UPDATE_STATUS', current);
    } catch { /* finestra in chiusura */ }
};

export const setUpdaterWindow = (win: BrowserWindow) => { boundWindow = win; };

export const initUpdater = (
    isSessionActive: () => boolean,
    log: (level: 'info' | 'success' | 'error', message: string) => void,
) => {
    if (started) return;
    started = true;

    // Riallineamento dopo un ricaricamento dell'interfaccia, e "Aggiorna ora".
    ipcMain.handle('get-update-status', () => current);
    ipcMain.handle('install-update', () => {
        if (current.state !== 'ready') return { ok: false, message: 'Nessun aggiornamento pronto.' };
        if (isSessionActive()) return { ok: false, message: 'Sei in diretta: l\'aggiornamento si installerà alla chiusura.' };
        log('info', `installo la versione ${current.version} e riavvio StreamFlow`);
        // Silenzioso e con riavvio: chi preme il pulsante si aspetta di ritrovare l'app.
        setImmediate(() => autoUpdater.quitAndInstall(true, true));
        return { ok: true };
    });

    // Fuori dall'app installata (npm run electron:dev) non c'è niente da aggiornare.
    if (!app.isPackaged) return;

    autoUpdater.logger = null;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('update-available', (info) => {
        log('info', `nuova versione ${info.version} disponibile: la scarico in sottofondo`);
        publish({ state: 'downloading', version: info.version });
    });
    autoUpdater.on('update-downloaded', (info) => {
        log('success', `versione ${info.version} pronta: si installa alla chiusura di StreamFlow`);
        publish({ state: 'ready', version: info.version });
    });
    autoUpdater.on('error', (err) => {
        // Senza rete o con GitHub giù è normale: niente allarmi, solo una riga nel log.
        log('info', `controllo aggiornamenti non riuscito (${err?.message?.split('\n')[0] ?? 'errore sconosciuto'})`);
        if (current.state === 'downloading') publish({ state: 'idle' });
    });

    const check = () => {
        if (current.state === 'ready' || isSessionActive()) return;
        autoUpdater.checkForUpdates().catch(() => { /* già gestito da 'error' */ });
    };
    setTimeout(check, FIRST_CHECK_DELAY_MS);
    setInterval(check, CHECK_INTERVAL_MS);
};
