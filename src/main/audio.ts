import { ipcMain } from 'electron';

// Placeholder for FFmpeg spawning logic
console.log('Audio module loaded');

ipcMain.handle('start-stream', async (_event, config) => {
    console.log('Starting stream with config:', config);
    // TODO: Spawn FFmpeg
    return { success: true };
});

ipcMain.handle('stop-stream', async () => {
    console.log('Stopping stream');
    // TODO: Kill FFmpeg
    return { success: true };
});
