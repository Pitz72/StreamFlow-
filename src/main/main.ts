import { app, BrowserWindow, desktopCapturer, session } from 'electron';
import path from 'path';
import { initializeIpc, cleanupIpc } from './ipcp';

let mainWindow: BrowserWindow | null = null;

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
        backgroundColor: '#0f0f0f',
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

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // initializeIpc è idempotente: registra gli handler una sola volta e
    // ricollega la finestra corrente a StreamManager/log sink a ogni chiamata.
    initializeIpc(mainWindow);
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

// Cleanup FFmpeg process before quitting to prevent orphan processes
app.on('before-quit', () => {
    cleanupIpc();
});
