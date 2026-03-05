import { ipcMain, BrowserWindow } from 'electron';
import { StreamManager } from './streaming/ffmpeg-manager';

let streamManager: StreamManager | null = null;

export const cleanupIpc = () => {
    if (streamManager) {
        streamManager.stop();
        streamManager = null;
    }
};

export const initializeIpc = (mainWindow: BrowserWindow) => {
    streamManager = new StreamManager(mainWindow);

    ipcMain.handle('start-stream', async (_event, config) => {
        if (streamManager) {
            streamManager.start(config);
        }
    });

    ipcMain.handle('stop-stream', async () => {
        if (streamManager) {
            streamManager.stop();
        }
    });

    ipcMain.handle('get-audio-devices', async () => {
        return await StreamManager.getWindowsAudioDevices();
    });
};
