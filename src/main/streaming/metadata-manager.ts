import net from 'net';

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
     * Replica BUTT: encoding minimale, solo spazi → %20 e & → %26.
     * NON usa encodeURIComponent perché Liquidsoap accetta `/` letterale nel mount
     * e gestisce caratteri unicode senza encoding nel song.
     */
    private buttEncode(s: string): string {
        return s.replace(/ /g, '%20').replace(/&/g, '%26');
    }

    async send(artist: string, title: string): Promise<MetaSendResult> {
        if (!this.config) {
            return { ok: false, requestLine: '', rawResponse: '', error: 'Nessuno stream attivo' };
        }

        const { host, port, user, password, mount } = this.config;
        const portNum = parseInt(port, 10);
        const song = artist && title
            ? `${artist} - ${title}`
            : title || artist || '';

        const cleanMount = mount.startsWith('/') ? mount : `/${mount}`;
        const auth = Buffer.from(`${user || 'source'}:${password}`).toString('base64');

        // Costruzione esatta a la BUTT.
        // Riga GET, poi 3 headers, poi linea vuota.
        const songEnc = this.buttEncode(song);
        const requestLine = `GET /admin/metadata?mode=updinfo&mount=${cleanMount}&song=${songEnc} HTTP/1.0`;
        const hostHeader = portNum === 80 ? host : `${host}:${portNum}`;

        const rawRequest =
            `${requestLine}\r\n` +
            `User-Agent: StreamFlow/0.5.3 (BUTT-compat)\r\n` +
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
