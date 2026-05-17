import { ipcMain, BrowserWindow } from 'electron';
import { StreamManager } from './streaming/ffmpeg-manager';
import { MetadataManager } from './streaming/metadata-manager';
import { fetchStations, fetchStationDetail, uploadStationArt } from './azuracast/azuracast-api';

let streamManager: StreamManager | null = null;
const metadataManager = new MetadataManager();

export const cleanupIpc = () => {
    if (streamManager) {
        streamManager.stop();
        streamManager = null;
    }
    metadataManager.clearConfig();
};

export const initializeIpc = (mainWindow: BrowserWindow) => {
    streamManager = new StreamManager(mainWindow);

    ipcMain.handle('start-stream', async (_event, config) => {
        if (streamManager) {
            streamManager.start(config);
            // Store config in MetadataManager so update-metadata can use it
            metadataManager.setConfig({
                host: config.host,
                port: config.port,
                user: config.icecastUser || 'source',
                password: config.password,
                mount: config.mount,
            });
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
        try {
            await metadataManager.send(artist, title);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
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

    ipcMain.handle('azuracast-upload-art', async (_event, { url, apiKey, stationId, imageBase64 }: { url: string; apiKey: string; stationId: number; imageBase64: string }) => {
        try {
            await uploadStationArt(url, apiKey, stationId, imageBase64);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    });
};
