import { app, BrowserWindow } from 'electron';
import path from 'path';

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
            sandbox: false, // For FFmpeg spawning
        },
        autoHideMenuBar: true,
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

import { initializeIpc, cleanupIpc } from './ipcp';

let ipcInitialized = false;

app.whenReady().then(() => {
    createWindow();
    if (mainWindow) {
        initializeIpc(mainWindow);
        ipcInitialized = true;
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
            if (mainWindow && !ipcInitialized) {
                initializeIpc(mainWindow);
                ipcInitialized = true;
            }
        }
    });
});

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
