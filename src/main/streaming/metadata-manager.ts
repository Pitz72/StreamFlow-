import net from 'net';
import { app } from 'electron';

/**
 * Inviare metadata a Liquidsoap harbor / Icecast usando RAW socket + HTTP/1.0.
 *
 * Background: il modulo http di Node forza HTTP/1.1 e aggiunge headers
 * (Connection, Transfer-Encoding, ecc) che alcuni harbor Liquidsoap parsano
 * male, ritornando body strani o non processando l'updinfo. BUTT (che funziona
 * con AzuraCast/Liquidsoap) scrive bytes a mano via socket, usando HTTP/1.0
 * e nessun header oltre a User-Agent, Authorization, Host.
 *
 * Riferimento BUTT: src/icecast.cpp, funzione ic_send_song_update (righe ~330-370)
 * https://github.com/romansavrulin/butt/blob/master/src/icecast.cpp
 */

interface MetaConfig {
    host: string;
    port: string;
    user: string;
    password: string;
    mount: string;
}

export interface MetaSendResult {
    ok: boolean;
    httpStatus?: number;
    requestLine: string;
    rawResponse: string;
    error?: string;
}

export class MetadataManager {
    private config: MetaConfig | null = null;
    private logSink: ((level: 'info' | 'success' | 'error', msg: string) => void) | null = null;

    setConfig(config: MetaConfig) { this.config = config; }
    clearConfig() { this.config = null; }
    setLogSink(sink: (level: 'info' | 'success' | 'error', msg: string) => void) { this.logSink = sink; }

    private log(level: 'info' | 'success' | 'error', msg: string) {
        if (this.logSink) this.logSink(level, msg);
        console.log(`[MetadataManager] ${level}: ${msg}`);
    }

    /**
     * Replica BUTT: encoding minimale (Liquidsoap accetta `/` letterale nel mount
     * e caratteri unicode non-encoded nel song), ma con sanificazione dei byte che
     * spezzerebbero la richiesta HTTP scritta a mano:
     * - caratteri di controllo (CR/LF = header injection sul raw socket) → spazio
     * - `%` `#` `?` (alterano la request line / vengono interpretati) → percent-encoded
     */
    private buttEncode(s: string): string {
        return s
            // eslint-disable-next-line no-control-regex -- i control char sono esattamente ciò che va rimosso
            .replace(/[\x00-\x1F\x7F]+/g, ' ')
            .replace(/%/g, '%25')
            .replace(/ /g, '%20')
            .replace(/&/g, '%26')
            .replace(/#/g, '%23')
            .replace(/\?/g, '%3F');
    }

    async send(artist: string, title: string): Promise<MetaSendResult> {
        if (!this.config) {
            return { ok: false, requestLine: '', rawResponse: '', error: 'Nessuno stream attivo' };
        }

        const { host, port, user, password, mount } = this.config;
        const portNum = parseInt(port, 10);
        if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
            return { ok: false, requestLine: '', rawResponse: '', error: `Porta non valida: "${port}"` };
        }
        const song = artist && title
            ? `${artist} - ${title}`
            : title || artist || '';

        // Il mount non viene percent-encoded (il `/` letterale serve a Liquidsoap),
        // ma niente whitespace/control chars: spezzerebbero la request line.
        // eslint-disable-next-line no-control-regex -- i control char sono esattamente ciò che va rimosso
        const safeMount = mount.replace(/[\x00-\x20\x7F]/g, '');
        const cleanMount = safeMount.startsWith('/') ? safeMount : `/${safeMount}`;
        const auth = Buffer.from(`${user || 'source'}:${password}`).toString('base64');

        // Costruzione esatta a la BUTT.
        // Riga GET, poi 3 headers, poi linea vuota.
        const songEnc = this.buttEncode(song);
        const requestLine = `GET /admin/metadata?mode=updinfo&mount=${cleanMount}&song=${songEnc} HTTP/1.0`;
        const hostHeader = portNum === 80 ? host : `${host}:${portNum}`;

        const rawRequest =
            `${requestLine}\r\n` +
            `User-Agent: StreamFlow/${app.getVersion()} (BUTT-compat)\r\n` +
            `Authorization: Basic ${auth}\r\n` +
            `Host: ${hostHeader}\r\n` +
            `\r\n`;

        this.log('info', `→ ${host}:${portNum} ${requestLine}`);

        return new Promise<MetaSendResult>((resolve) => {
            const sock = new net.Socket();
            let rawResponse = '';
            let settled = false;

            const finish = (result: MetaSendResult) => {
                if (settled) return;
                settled = true;
                try { sock.destroy(); } catch { /* ignore */ }
                if (result.ok) {
                    this.log('success', `✓ metadata accettato (HTTP ${result.httpStatus ?? '?'})`);
                } else {
                    this.log('error', `✗ ${result.error || 'errore'} (HTTP ${result.httpStatus ?? '?'})`);
                }
                resolve(result);
            };

            sock.setTimeout(5000);
            sock.setEncoding('utf8');

            sock.on('connect', () => {
                sock.write(rawRequest);
            });

            sock.on('data', (chunk: string) => {
                rawResponse += chunk;
                if (rawResponse.length > 4096) {
                    // basta per parsare status + body iniziale
                    sock.end();
                }
            });

            sock.on('end', () => {
                const parsed = parseRawHttpResponse(rawResponse);
                finish(evaluateResponse(requestLine, rawResponse, parsed));
            });

            sock.on('timeout', () => {
                // Alcuni server rispondono ma non chiudono la connessione (l''end'
                // non arriva mai): se abbiamo già una risposta HTTP parsabile,
                // valutiamola invece di riportare un falso timeout.
                const parsed = parseRawHttpResponse(rawResponse);
                if (parsed.status !== null) {
                    finish(evaluateResponse(requestLine, rawResponse, parsed));
                    return;
                }
                finish({
                    ok: false,
                    requestLine,
                    rawResponse,
                    error: 'Timeout connessione (5s)',
                });
            });

            sock.on('error', (err) => {
                finish({
                    ok: false,
                    requestLine,
                    rawResponse,
                    error: `Errore socket: ${err.message}`,
                });
            });

            sock.connect(portNum, host);
        });
    }
}

interface ParsedHttp {
    status: number | null;
    statusText: string;
    headers: Record<string, string>;
    body: string;
}

function parseRawHttpResponse(raw: string): ParsedHttp {
    const headerEnd = raw.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
        return { status: null, statusText: '', headers: {}, body: raw };
    }
    const headerPart = raw.substring(0, headerEnd);
    const body = raw.substring(headerEnd + 4);
    const lines = headerPart.split('\r\n');
    const statusLine = lines[0] || '';
    const statusMatch = statusLine.match(/^HTTP\/\d\.\d\s+(\d+)\s*(.*)$/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : null;
    const statusText = statusMatch ? statusMatch[2] : '';
    const headers: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
        const idx = lines[i].indexOf(':');
        if (idx > 0) {
            const k = lines[i].substring(0, idx).trim().toLowerCase();
            const v = lines[i].substring(idx + 1).trim();
            headers[k] = v;
        }
    }
    return { status, statusText, headers, body };
}

function evaluateResponse(requestLine: string, rawResponse: string, parsed: ParsedHttp): MetaSendResult {
    const base = { requestLine, rawResponse, httpStatus: parsed.status ?? undefined };

    if (parsed.status === null) {
        return { ...base, ok: false, error: 'Risposta non HTTP valida' };
    }
    if (parsed.status >= 400) {
        const snippet = parsed.body.trim().substring(0, 150) || parsed.statusText;
        return { ...base, ok: false, error: `HTTP ${parsed.status} — ${snippet}` };
    }
    // Icecast XML success: <return>1</return>
    if (/<return>\s*1\s*<\/return>/i.test(parsed.body)) {
        return { ...base, ok: true };
    }
    // Icecast XML error: <return>0</return> + <message>
    if (/<return>\s*0\s*<\/return>/i.test(parsed.body)) {
        const msgMatch = parsed.body.match(/<message>([^<]*)<\/message>/i);
        const msg = msgMatch ? msgMatch[1].trim() : 'rifiutato dal server';
        return { ...base, ok: false, error: `Icecast XML: ${msg}` };
    }
    // 200 con body vuoto → accettato dal harbor (Liquidsoap risponde così)
    if (parsed.status >= 200 && parsed.status < 300) {
        return { ...base, ok: true };
    }
    return { ...base, ok: false, error: `Risposta inattesa (HTTP ${parsed.status})` };
}
