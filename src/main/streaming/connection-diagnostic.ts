import { spawn } from 'child_process';
import dns from 'dns';
import net from 'net';
import http from 'http';
import ffmpegPathRaw from 'ffmpeg-static';
import { writeLog, writeRaw } from '../file-logger';

// Stessa correzione di ffmpeg-manager: dentro l'asar il binario non è eseguibile.
const ffmpegPath = ffmpegPathRaw?.replace('app.asar', 'app.asar.unpacked') ?? null;

/**
 * Diagnostica attiva della connessione (D2).
 *
 * Nasce dal caso di un DJ la cui diretta cadeva dopo ~1 secondo con
 * `-10054` (WSAECONNRESET) mentre OBS, sulla stessa macchina, trasmetteva
 * senza problemi. Un log passivo non aggiunge niente: FFmpeg sa solo che il
 * socket è morto. Serve invece provare i singoli strati uno per uno e vedere
 * quale cede — e soprattutto catturare la RISPOSTA HTTP del server, che al
 * livello di log predefinito non viene mai stampata.
 *
 * Nota: la prova finale usa le credenziali vere e occupa il mount per pochi
 * secondi. Non va lanciata mentre qualcuno è in onda.
 */

export interface DiagnosticConfig {
    host: string;
    port: string;
    mount: string;
    icecastUser?: string;
    password: string;
    bitrate?: string;
}

export interface DiagnosticResult {
    ok: boolean;
    /** Riepilogo in italiano, già pronto da mostrare o da incollare in una mail. */
    summary: string;
}

type Emit = (level: 'info' | 'success' | 'error', message: string) => void;

/** Durata della trasmissione di prova. Abbastanza da superare il punto di rottura osservato (~1s). */
const PROBE_SECONDS = 20;
const TCP_TIMEOUT_MS = 8000;

/** Risolve tutti gli indirizzi dell'host, IPv4 e IPv6. */
async function resolveAll(host: string): Promise<{ address: string; family: number }[]> {
    // Se l'utente ha già messo un IP letterale, lookup lo restituisce tale e quale.
    const res = await dns.promises.lookup(host, { all: true, verbatim: true });
    return res.map((r) => ({ address: r.address, family: r.family }));
}

/**
 * Apre una connessione TCP grezza verso un singolo indirizzo.
 * @returns millisecondi impiegati, oppure il messaggio di errore.
 */
function tcpProbe(address: string, port: number, family: number): Promise<{ ok: boolean; ms: number; error?: string }> {
    return new Promise((resolve) => {
        const started = Date.now();
        let settled = false;
        const done = (r: { ok: boolean; ms: number; error?: string }) => {
            if (settled) return;
            settled = true;
            try { socket.destroy(); } catch { /* già chiuso */ }
            resolve(r);
        };

        const socket = net.connect({ host: address, port, family });
        socket.setTimeout(TCP_TIMEOUT_MS);
        socket.on('connect', () => done({ ok: true, ms: Date.now() - started }));
        socket.on('timeout', () => done({ ok: false, ms: Date.now() - started, error: `nessuna risposta entro ${TCP_TIMEOUT_MS / 1000}s` }));
        socket.on('error', (e) => done({ ok: false, ms: Date.now() - started, error: e.message }));
    });
}

export interface AuthOutcome {
    status: number | null;
    text: string;
}

/**
 * Verifica delle credenziali leggendo davvero la risposta del server.
 *
 * È il pezzo che a FFmpeg manca: con `chunked_post=0` non legge mai la risposta,
 * continua a scrivere finché il server non chiude, e riporta solo un errore di
 * socket (`-10054`) che sembra un guasto di rete. Qui apriamo lo stesso PUT con
 * il client HTTP di Node, che la risposta la legge.
 *
 * Comportamento osservato sull'harbor Liquidsoap di AzuraCast:
 * - utente noto, password errata → `401 Unauthorized`, leggibile
 * - utente sconosciuto → connessione azzerata senza risposta
 */
export function httpAuthCheck(cfg: DiagnosticConfig): Promise<AuthOutcome> {
    return new Promise((resolve) => {
        const user = cfg.icecastUser || 'source';
        const mount = !cfg.mount || cfg.mount === '' ? '/' : cfg.mount;
        const creds = Buffer.from(`${user}:${cfg.password}`).toString('base64');

        const req = http.request({
            host: cfg.host,
            port: parseInt(cfg.port, 10),
            path: mount,
            method: 'PUT',
            headers: {
                'User-Agent': 'FMLE/3.0',
                'Ice-Public': '1',
                'Content-Type': 'audio/mpeg',
                Authorization: `Basic ${creds}`,
            },
        });

        let settled = false;
        const done = (r: AuthOutcome) => {
            if (settled) return;
            settled = true;
            try { req.destroy(); } catch { /* già chiusa */ }
            resolve(r);
        };

        req.on('response', (res) => {
            const code = res.statusCode ?? 0;
            if (code === 401) {
                done({ status: code, text: 'CREDENZIALI RIFIUTATE (401): la password non corrisponde a quella impostata sul server per questo nome utente' });
            } else if (code === 403) {
                done({ status: code, text: 'ACCESSO NEGATO (403): utente valido ma non abilitato su questo canale, oppure una sorgente è già collegata' });
            } else if (code >= 200 && code < 300) {
                done({ status: code, text: `credenziali accettate (${code})` });
            } else {
                done({ status: code, text: `risposta inattesa dal server: ${code} ${res.statusMessage ?? ''}`.trim() });
            }
        });
        req.on('error', (e: NodeJS.ErrnoException) => {
            if (e.code === 'ECONNRESET') {
                done({ status: null, text: 'il server ha chiuso senza rispondere: nome utente non riconosciuto (un utente esistente con password errata riceverebbe un 401)' });
            } else {
                done({ status: null, text: `verifica non riuscita: ${e.message}` });
            }
        });
        req.setTimeout(TCP_TIMEOUT_MS, () => done({ status: null, text: 'nessuna risposta dal server entro 8s' }));

        // Serve un po' di corpo perché l'harbor valuti la richiesta e risponda.
        req.write(Buffer.alloc(4096));
    });
}

interface ProbeOutcome {
    connected: boolean;
    survivedSeconds: number;
    kbSent: number;
    exitCode: number | null;
    reset: boolean;
    httpStatus: string | null;
}

/**
 * Trasmette PROBE_SECONDS di silenzio generato (`anullsrc`) verso il server
 * reale, con gli stessi header della diretta. `-loglevel verbose` fa stampare
 * a FFmpeg l'intero dialogo HTTP, risposta del server inclusa: è l'unica via
 * per vedere se qualcosa si sta interponendo tra client e harbor.
 */
function ffmpegProbe(cfg: DiagnosticConfig, emit: Emit): Promise<ProbeOutcome> {
    return new Promise((resolve) => {
        const user = cfg.icecastUser || 'source';
        const mount = !cfg.mount || cfg.mount === '' ? '/' : cfg.mount;
        const creds = Buffer.from(`${user}:${cfg.password}`).toString('base64');
        const targetUrl = `http://${cfg.host}:${cfg.port}${mount}`;
        const httpHeaders = `User-Agent: FMLE/3.0\r\nExpect:\r\nIce-Public: 1\r\nAuthorization: Basic ${creds}\r\n`;

        const args = [
            '-loglevel', 'verbose',
            // `-re` è essenziale: senza, `anullsrc` viene spinto a ~50x e i 20s di
            // prova finiscono nel buffer del socket in un istante, mascherando
            // proprio il taglio che stiamo cercando. Verificato sul campo: con -re
            // il fallimento si riproduce a 0,65s, senza non si riproduce affatto.
            '-re',
            '-f', 'lavfi',
            '-i', `anullsrc=r=44100:cl=stereo`,
            '-t', String(PROBE_SECONDS),
            '-acodec', 'libmp3lame',
            '-b:a', `${cfg.bitrate || '128'}k`,
            '-ar', '44100',
            '-content_type', 'audio/mpeg',
            '-f', 'mp3',
            '-method', 'PUT',
            '-chunked_post', '0',
            '-headers', httpHeaders,
            targetUrl,
        ];

        if (!ffmpegPath) {
            resolve({ connected: false, survivedSeconds: 0, kbSent: 0, exitCode: null, reset: false, httpStatus: 'binario FFmpeg non trovato' });
            return;
        }

        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        let connected = false;
        let connectedAt = 0;
        let kbSent = 0;
        let reset = false;
        let httpStatus: string | null = null;
        // Guardia: se FFmpeg si impianta senza mai uscire, non lasciamo la
        // promise pendente (bloccherebbe il pulsante in Configurazione).
        const hardStop = setTimeout(() => {
            try { proc.kill(); } catch { /* già morto */ }
        }, (PROBE_SECONDS + 15) * 1000);

        proc.stderr?.on('data', (data) => {
            const msg: string = data.toString();
            // Tutto su file: al livello verbose qui dentro c'è il dialogo HTTP completo.
            writeRaw('probe', msg);

            if (!httpStatus) {
                const m = msg.match(/HTTP\/1\.[01]\s+(\d{3}[^\r\n]*)/);
                if (m) {
                    httpStatus = m[1].trim();
                    emit('info', `risposta HTTP del server: ${httpStatus}`);
                }
            }
            if (/10054|10053|WSAECONNRESET|WSAECONNABORTED|Connection reset/i.test(msg)) reset = true;

            const sizeMatch = msg.match(/size=\s*(\d+)\s*(k|Ki)?B/i);
            if (sizeMatch) kbSent = Math.max(kbSent, parseInt(sizeMatch[1], 10));

            if ((msg.includes('size=') || msg.includes('time=')) && !connected) {
                connected = true;
                connectedAt = Date.now();
                emit('success', 'dati in transito verso il server');
            }
        });

        proc.on('error', (e) => {
            clearTimeout(hardStop);
            resolve({ connected, survivedSeconds: 0, kbSent, exitCode: null, reset, httpStatus: e.message });
        });

        proc.on('close', (code) => {
            clearTimeout(hardStop);
            const survived = connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0;
            resolve({ connected, survivedSeconds: survived, kbSent, exitCode: code, reset, httpStatus });
        });
    });
}

/**
 * Esegue l'intera sequenza. Ogni passo viene annunciato via `emit` (che finisce
 * sia nel pannello Log sia nel file) così l'utente vede il progresso.
 */
export async function runConnectionDiagnostic(cfg: DiagnosticConfig, emit: Emit): Promise<DiagnosticResult> {
    const lines: string[] = [];
    const record = (level: 'info' | 'success' | 'error', msg: string) => {
        lines.push(msg);
        emit(level, msg);
    };

    writeLog('system', 'info', '───── TEST CONNESSIONE: inizio ─────');
    record('info', `test connessione → ${cfg.host}:${cfg.port}${cfg.mount || '/'} (${PROBE_SECONDS}s di silenzio di prova)`);

    // ── 1. DNS ────────────────────────────────────────────────────────────
    let addresses: { address: string; family: number }[] = [];
    try {
        addresses = await resolveAll(cfg.host);
        const v4 = addresses.filter((a) => a.family === 4).map((a) => a.address);
        const v6 = addresses.filter((a) => a.family === 6).map((a) => a.address);
        record('success', `DNS: ${addresses.length} indirizzo/i — IPv4: ${v4.join(', ') || 'nessuno'} | IPv6: ${v6.join(', ') || 'nessuno'}`);
        if (v6.length > 0 && v4.length > 0) {
            record('info', 'host raggiungibile sia in IPv4 sia in IPv6: se il percorso IPv6 è difettoso, la connessione si apre e muore subito dopo');
        }
    } catch (e) {
        record('error', `DNS fallito: ${(e as Error).message} — il nome host non si risolve da questa rete`);
        return { ok: false, summary: lines.join('\n') };
    }

    // ── 2. TCP, indirizzo per indirizzo ───────────────────────────────────
    const port = parseInt(cfg.port, 10);
    let anyTcpOk = false;
    for (const a of addresses) {
        const r = await tcpProbe(a.address, port, a.family);
        if (r.ok) {
            anyTcpOk = true;
            record('success', `TCP IPv${a.family} ${a.address}:${port} — connesso in ${r.ms}ms`);
        } else {
            record('error', `TCP IPv${a.family} ${a.address}:${port} — FALLITO dopo ${r.ms}ms (${r.error})`);
        }
    }
    if (!anyTcpOk) {
        record('error', 'nessun indirizzo raggiungibile sulla porta: la porta è bloccata da firewall/antivirus o dalla rete');
        writeLog('system', 'info', '───── TEST CONNESSIONE: fine ─────');
        return { ok: false, summary: lines.join('\n') };
    }

    // ── 3. Credenziali ────────────────────────────────────────────────────
    // Prima della prova lunga: è il controllo più informativo e costa mezzo secondo.
    const auth = await httpAuthCheck(cfg);
    const authFailed = auth.status === 401 || auth.status === 403 || auth.status === null;
    record(authFailed ? 'error' : 'success', `credenziali per "${cfg.icecastUser || 'source'}": ${auth.text}`);
    if (authFailed) {
        record('error', 'test interrotto: senza credenziali valide la prova di trasmissione fallirebbe con un errore di rete fuorviante (-10054), non con un messaggio di autenticazione');
        writeLog('system', 'info', '───── TEST CONNESSIONE: fine ─────');
        return { ok: false, summary: lines.join('\n') };
    }

    // ── 4. PUT reale con log verboso ──────────────────────────────────────
    record('info', `invio ${PROBE_SECONDS}s di prova con log dettagliato...`);
    const p = await ffmpegProbe(cfg, emit);

    if (p.httpStatus) record('info', `stato HTTP: ${p.httpStatus}`);

    if (!p.connected) {
        record('error', 'il server non ha mai accettato il flusso: credenziali rifiutate o mount errato (vedi il dettaglio HTTP nel file di log)');
    } else if (p.reset && p.survivedSeconds < PROBE_SECONDS) {
        record('error', `flusso interrotto dal server dopo ${p.survivedSeconds}s (${p.kbSent} kB inviati) con una chiusura netta della connessione. Il livello TCP e l'autenticazione funzionano: qualcosa taglia il flusso HTTP mentre scorre — tipicamente un antivirus con scansione web, o un intermediario di rete.`);
    } else if (p.survivedSeconds >= PROBE_SECONDS - 2) {
        record('success', `test superato: ${p.survivedSeconds}s di trasmissione continua, ${p.kbSent} kB inviati senza interruzioni`);
    } else {
        record('error', `flusso terminato in anticipo dopo ${p.survivedSeconds}s (uscita FFmpeg ${p.exitCode}) — dettagli completi nel file di log`);
    }

    writeLog('system', 'info', '───── TEST CONNESSIONE: fine ─────');
    const ok = p.connected && p.survivedSeconds >= PROBE_SECONDS - 2;
    return { ok, summary: lines.join('\n') };
}
