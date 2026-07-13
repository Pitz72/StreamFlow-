import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initializeIpc, cleanupIpc } from './ipcp';

let mainWindow: BrowserWindow | null = null;

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
