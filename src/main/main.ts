import { app, BrowserWindow, desktopCapturer, dialog, session } from 'electron';
import path from 'path';
import { initializeIpc, shutdownIpc, isStreamSessionActive, logSystem } from './ipcp';
import { initUpdater, setUpdaterWindow } from './updater';

let mainWindow: BrowserWindow | null = null;

const loadRenderer = (win: BrowserWindow) => {
    if (process.env.NODE_ENV === 'development') {
        void win.loadURL('http://localhost:5173');
    } else {
        void win.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
};

/** Oltre questo numero di crash in un minuto l'interfaccia non viene più ricaricata. */
const MAX_RENDERER_RELOADS_PER_MINUTE = 3;

/**
 * Chiudere la finestra ferma la diretta all'istante. Una X o un Alt+F4 dati per
 * sbaglio non devono bastare: se c'è una sessione attiva si chiede conferma,
 * con "Resta in onda" come scelta predefinita (anche per Invio ed Esc).
 */
const guardCloseDuringLive = (win: BrowserWindow) => {
    // Arresto o disconnessione di Windows: nessun dialogo, che bloccherebbe lo
    // spegnimento con un "questa app impedisce l'arresto" incomprensibile.
    let systemSessionEnding = false;
    win.on('session-end', () => { systemSessionEnding = true; });

    win.on('close', (event) => {
        if (systemSessionEnding || !isStreamSessionActive()) return;
        const choice = dialog.showMessageBoxSync(win, {
            type: 'warning',
            title: 'Sei in diretta',
            message: 'Sei ancora in diretta.',
            detail: 'Se chiudi StreamFlow la diretta si interrompe subito e chi ascolta sente il silenzio.',
            buttons: ['Resta in onda', 'Chiudi e ferma la diretta'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
        });
        if (choice !== 1) {
            event.preventDefault();
            return;
        }
        logSystem('info', 'finestra chiusa durante la diretta, confermato dall\'utente');
    });
};

/**
 * Crash dell'interfaccia. La diretta vive nel main e sopravvive, ma in MIX MODE
 * l'audio nasce nel renderer: senza interfaccia la radio va muta. Si ricarica
 * subito — il mixer riparte da solo, l'interfaccia si riallinea allo stato della
 * sessione (STREAM_SYNC) — con un limite contro i cicli di crash.
 */
const recoverFromRendererCrash = (win: BrowserWindow) => {
    const recentCrashes: number[] = [];

    win.webContents.on('render-process-gone', (_event, details) => {
        const live = isStreamSessionActive();
        logSystem('error', `interfaccia terminata in modo anomalo (${details.reason}, codice ${details.exitCode})`
            + (live ? ' — la sessione di trasmissione è ancora attiva' : ''));
        if (details.reason === 'clean-exit' || win.isDestroyed()) return;

        const now = Date.now();
        recentCrashes.push(now);
        while (recentCrashes.length > 0 && now - recentCrashes[0] > 60_000) recentCrashes.shift();
        if (recentCrashes.length > MAX_RENDERER_RELOADS_PER_MINUTE) {
            logSystem('error', `più di ${MAX_RENDERER_RELOADS_PER_MINUTE} crash dell'interfaccia in un minuto: non la ricarico più. Chiudi e riapri StreamFlow.`);
            return;
        }
        logSystem('info', 'ricarico l\'interfaccia...');
        // loadFile/loadURL e non reload(): dopo un crash reload() non ha ricreato
        // l'interfaccia (verificato sulla build 0.8.6: pagina mai tornata).
        // Fuori dall'handler, a evento concluso.
        setImmediate(() => { if (!win.isDestroyed()) loadRenderer(win); });
    });

    win.webContents.on('unresponsive', () => {
        logSystem('error', 'l\'interfaccia non risponde' + (isStreamSessionActive() ? ' (la sessione di trasmissione è attiva)' : ''));
    });
    win.webContents.on('responsive', () => {
        logSystem('info', 'l\'interfaccia risponde di nuovo');
    });
};

/**
 * MIX MODE — abilita la cattura dell'audio di sistema (loopback WASAPI).
 *
 * Senza questo handler `getDisplayMedia` nel renderer viene rifiutata da
 * Electron. Con `audio: 'loopback'` catturiamo quello che il PC sta suonando —
 * cioè Runtime Live Machine Pro — SENZA driver o schede audio virtuali: è
 * questo che rende la modalità mix configurazione-zero per chi trasmette.
 *
 * Il video è richiesto solo perché getDisplayMedia pretende una traccia video:
 * il renderer la ferma e la scarta subito (nessuna cattura schermo attiva).
 * thumbnailSize 0×0 evita di generare anteprime che non guarderà nessuno.
 */
const enableSystemAudioLoopback = () => {
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
        desktopCapturer
            .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
            .then((sources) => {
                if (sources.length === 0) {
                    // Nessuno schermo enumerabile: negando la richiesta il renderer
                    // riceve un errore esplicito e lo mostra, invece di restare muto.
                    callback({});
                    return;
                }
                callback({ video: sources[0], audio: 'loopback' });
            })
            .catch(() => callback({}));
    }, { useSystemPicker: false });
};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#040B0A',
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            // I VU meter (requestAnimationFrame) devono restare fluidi anche quando
            // l'app è dietro un'altra finestra durante la diretta: senza questo
            // Electron rallenta rAF/timer a ~1fps sulle finestre in background.
            backgroundThrottling: false,
        },
        autoHideMenuBar: true,
    });

    // Il renderer carica solo contenuto locale: blocca window.open e navigazioni esterne.
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const allowed = process.env.NODE_ENV === 'development'
            ? url.startsWith('http://localhost:5173')
            : url.startsWith('file://');
        if (!allowed) event.preventDefault();
    });

    loadRenderer(mainWindow);

    guardCloseDuringLive(mainWindow);
    recoverFromRendererCrash(mainWindow);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // initializeIpc è idempotente: registra gli handler una sola volta e
    // ricollega la finestra corrente a StreamManager/log sink a ogni chiamata.
    initializeIpc(mainWindow);
    setUpdaterWindow(mainWindow);
}

// Una sola istanza: due StreamFlow si contenderebbero il device audio e il harbor.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        enableSystemAudioLoopback();
        createWindow();
        initUpdater(isStreamSessionActive, logSystem);

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}

// Quit when all windows are closed (Windows/Linux behavior)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Prima di uscire si chiude FFmpeg (niente processi orfani che trasmettono).
// L'uscita aspetta l'arresto pulito, al massimo pochi secondi; il secondo
// before-quit, quello di app.quit() qui sotto, passa dritto.
let shutdownDone = false;
app.on('before-quit', (event) => {
    if (shutdownDone) return;
    event.preventDefault();
    shutdownDone = true;
    void shutdownIpc().finally(() => app.quit());
});
