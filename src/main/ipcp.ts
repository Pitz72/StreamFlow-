import { ipcMain, BrowserWindow } from 'electron';
import { StreamManager } from './streaming/ffmpeg-manager';

let streamManager: StreamManager | null = null;

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
};
