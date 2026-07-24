import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Memoria password DJ cifrata con Electron safeStorage (DPAPI su Windows:
 * decifrabile solo dall'account utente del PC). Un file JSON in userData mappa
 * username → ciphertext base64. La password non transita MAI in chiaro su disco
 * né nel localStorage del renderer.
 */

const storePath = () => path.join(app.getPath('userData'), 'dj-credentials.json');

function readAll(): Record<string, string> {
    try {
        const parsed = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(all: Record<string, string>) {
    fs.writeFileSync(storePath(), JSON.stringify(all), 'utf8');
}

export function savePassword(username: string, password: string): boolean {
    if (!username || !password) return false;
    if (!safeStorage.isEncryptionAvailable()) return false;
    try {
        const all = readAll();
        all[username] = safeStorage.encryptString(password).toString('base64');
        writeAll(all);
        return true;
    } catch {
        return false;
    }
}

export function loadPassword(username: string): string | null {
    if (!username) return null;
    const b64 = readAll()[username];
    if (!b64) return null;
    try {
        return safeStorage.decryptString(Buffer.from(b64, 'base64'));
    } catch {
        // Cifratura di un altro account utente / file corrotto: trattato come assente.
        return null;
    }
}

export function deletePassword(username: string) {
    const all = readAll();
    if (username in all) {
        delete all[username];
        try {
            writeAll(all);
        } catch { /* best effort */ }
    }
}
