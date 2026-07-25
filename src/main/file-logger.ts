import { app, shell } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Log diagnostico su file (D1).
 *
 * Nasce da un caso reale: un DJ non riusciva a connettersi e l'unica traccia
 * disponibile era il pannello a video — 50 eventi in memoria, persi alla
 * chiusura, e senza lo stderr grezzo di FFmpeg che è dove sta la diagnosi.
 * Qui scriviamo tutto su file così l'utente può semplicemente allegarlo.
 *
 * Regole non negoziabili:
 * - NON deve mai far fallire l'app: ogni operazione è in try/catch silenzioso.
 * - NON deve mai contenere credenziali (vedi `redact`).
 */

/** Giorni di storico mantenuti; oltre, i file vengono eliminati all'avvio. */
const RETENTION_DAYS = 7;

let logFilePath: string | null = null;
let initialized = false;

/**
 * Rimuove le credenziali dal testo prima della scrittura.
 * L'header Authorization Basic contiene user:password in base64 — decodificabile
 * da chiunque riceva il file. Stessa cura per le query string tipo `password=`.
 */
export function redact(text: string): string {
    return text
        .replace(/(Authorization:\s*Basic\s+)\S+/gi, '$1***REDACTED***')
        .replace(/(password["'\s:=]+)[^\s"',&]+/gi, '$1***REDACTED***')
        .replace(/:\/\/[^:/@\s]+:[^@\s]+@/g, '://***REDACTED***@');
}

const pad = (n: number) => String(n).padStart(2, '0');

const stamp = (d: Date) =>
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;

const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function getLogDir(): string {
    return path.join(app.getPath('documents'), 'StreamFlow', 'logs');
}

/** Elimina i log più vecchi di RETENTION_DAYS. Silenzioso su qualunque errore. */
function pruneOldLogs(dir: string) {
    try {
        const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
        for (const name of fs.readdirSync(dir)) {
            if (!name.startsWith('streamflow-') || !name.endsWith('.log')) continue;
            const full = path.join(dir, name);
            if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
        }
    } catch { /* storico non potato: irrilevante */ }
}

/**
 * Prepara la cartella e apre il file del giorno. Idempotente.
 * @returns true se il log su file è operativo.
 */
export function initFileLogger(): boolean {
    if (initialized) return logFilePath !== null;
    initialized = true;
    try {
        const dir = getLogDir();
        fs.mkdirSync(dir, { recursive: true });
        pruneOldLogs(dir);
        logFilePath = path.join(dir, `streamflow-${dayKey(new Date())}.log`);

        const header = [
            '',
            '='.repeat(72),
            `StreamFlow ${app.getVersion()} — avvio ${new Date().toISOString()}`,
            `piattaforma: ${process.platform} ${process.arch} | electron ${process.versions.electron} | node ${process.versions.node}`,
            '='.repeat(72),
            '',
        ].join('\n');
        fs.appendFileSync(logFilePath, header, 'utf8');
        return true;
    } catch {
        // Documenti non scrivibile (percorso reindirizzato, disco pieno, permessi):
        // l'app continua senza log su file.
        logFilePath = null;
        return false;
    }
}

/** Scrive una riga nel log del giorno. Mai lancia. */
export function writeLog(source: string, level: string, message: string) {
    if (!logFilePath) return;
    try {
        const line = `[${stamp(new Date())}] [${source}/${level}] ${redact(message)}\n`;
        fs.appendFileSync(logFilePath, line, 'utf8');
    } catch { /* scrittura fallita: la diretta viene prima del log */ }
}

/**
 * Scrive un blocco di output grezzo (stderr di FFmpeg), indentato per
 * distinguerlo dagli eventi applicativi. Mai lancia.
 */
export function writeRaw(tag: string, text: string) {
    if (!logFilePath) return;
    try {
        const body = redact(text)
            .split('\n')
            .map((l) => l.trimEnd())
            .filter((l) => l.length > 0)
            .map((l) => `    | ${l}`)
            .join('\n');
        if (!body) return;
        fs.appendFileSync(logFilePath, `[${stamp(new Date())}] [${tag}]\n${body}\n`, 'utf8');
    } catch { /* vedi writeLog */ }
}

/** Apre la cartella dei log in Esplora risorse. @returns percorso aperto, o null. */
export async function openLogFolder(): Promise<string | null> {
    try {
        const dir = getLogDir();
        fs.mkdirSync(dir, { recursive: true });
        await shell.openPath(dir);
        return dir;
    } catch {
        return null;
    }
}
