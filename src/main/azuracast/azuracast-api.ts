import https from 'https';
import http from 'http';
import { Buffer } from 'buffer';

export interface AzStation {
    id: number;
    name: string;
}

export interface AzStreamer {
    id: number;
    username: string;
    displayName: string;
}

export interface AzStationDetail {
    host: string;
    port: string;
    mount: string;
    streamers: AzStreamer[];
    /**
     * true = port/mount sono fallback default (8005 / "/") perché l'API admin
     * non era accessibile (API Key senza permesso "Manage Station Broadcasting").
     * L'utente deve verificarli manualmente in AzuraCast → Broadcasting → How do I connect?
     */
    harborInferred: boolean;
}

function fetchJson<T>(url: string, apiKey: string): Promise<T> {
    return new Promise((resolve, reject) => {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return reject(new Error(`URL non valida: ${url}`));
        }

        const isHttps = parsed.protocol === 'https:';
        const mod = isHttps ? https : http;
        const defaultPort = isHttps ? 443 : 80;

        const req = mod.request(
            {
                hostname: parsed.hostname,
                port: parseInt(parsed.port) || defaultPort,
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers: {
                    'X-API-Key': apiKey,
                    Accept: 'application/json',
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    const status = res.statusCode ?? 0;
                    if (status < 200 || status >= 300) {
                        return reject(new Error(`HTTP ${status}`));
                    }
                    try {
                        resolve(JSON.parse(data) as T);
                    } catch {
                        reject(new Error('Risposta JSON non valida da AzuraCast'));
                    }
                });
            }
        );
        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy();
            reject(new Error('Timeout connessione AzuraCast'));
        });
        req.end();
    });
}

/**
 * Tenta di leggere backend_config dall'endpoint admin (richiede API Key con
 * permesso "Manage Station Broadcasting"). Ritorna null su qualsiasi errore
 * (auth, network, parsing) — il chiamante userà i default.
 */
async function tryFetchHarborConfig(
    baseUrl: string,
    apiKey: string,
    stationId: number
): Promise<{ dj_port?: number; dj_mount_point?: string } | null> {
    try {
        const data = await fetchJson<{
            backend_config?: {
                dj_port?: number;
                dj_mount_point?: string;
            };
        }>(`${baseUrl}/api/admin/station/${stationId}`, apiKey);
        return data.backend_config ?? null;
    } catch {
        return null;
    }
}

export async function fetchStations(baseUrl: string, apiKey: string): Promise<AzStation[]> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/stations`;
    const data = await fetchJson<{ id: number; name: string }[]>(url, apiKey);
    if (!Array.isArray(data)) throw new Error('Formato risposta inatteso da AzuraCast');
    return data.map((s) => ({ id: s.id, name: s.name }));
}

export async function fetchStationDetail(
    baseUrl: string,
    apiKey: string,
    stationId: number
): Promise<AzStationDetail> {
    const base = baseUrl.replace(/\/$/, '');

    const station = await fetchJson<{
        listen_url: string;
        mounts?: { path: string; is_default: boolean }[];
    }>(`${base}/api/station/${stationId}`, apiKey);

    // Host: dal listen_url (hostname pubblico della radio).
    let host = '';
    try {
        host = new URL(station.listen_url).hostname;
    } catch {
        host = new URL(base).hostname;
    }

    // Port + Mount: in AzuraCast il DJ NON si connette a Icecast (8000) sul mount
    // listener (es. /radio.mp3) — quello è occupato permanentemente da Liquidsoap.
    // Il DJ si connette all'INPUT HARBOR di Liquidsoap, su una porta separata
    // (default 8005) e mount default "/". Questi valori vivono in
    // backend_config.dj_port / dj_mount_point, accessibili solo via /api/admin/station/{id}
    // (richiede API Key con permesso "Manage Station Broadcasting").
    let port = '8005';
    let mount = '/';
    let harborInferred = true;

    const harborCfg = await tryFetchHarborConfig(base, apiKey, stationId);
    if (harborCfg?.dj_port) {
        port = String(harborCfg.dj_port);
        mount = harborCfg.dj_mount_point || '/';
        harborInferred = false;
    }

    // Fetch DJ/streamer accounts for this station
    const streamersRaw = await fetchJson<{
        id: number;
        streamer_username: string;
        display_name: string;
    }[]>(`${base}/api/station/${stationId}/streamers`, apiKey);

    const streamers: AzStreamer[] = Array.isArray(streamersRaw)
        ? streamersRaw.map((s) => ({
            id: s.id,
            username: s.streamer_username,
            displayName: s.display_name || s.streamer_username,
        }))
        : [];

    return { host, port, mount, streamers, harborInferred };
}

export async function uploadStationArt(
    baseUrl: string,
    apiKey: string,
    stationId: number,
    imageBase64: string
): Promise<void> {
    const base = baseUrl.replace(/\/$/, '');
    const endpoint = `${base}/api/station/${stationId}/art`;

    let parsed: URL;
    try {
        parsed = new URL(endpoint);
    } catch {
        throw new Error(`URL non valida: ${endpoint}`);
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const boundary = `----StreamFlowBoundary${Date.now()}`;
    const CRLF = '\r\n';

    const partHead = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="art"; filename="cover.jpg"${CRLF}` +
        `Content-Type: image/jpeg${CRLF}${CRLF}`
    );
    const partTail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
    const body = Buffer.concat([partHead, imageBuffer, partTail]);

    await new Promise<void>((resolve, reject) => {
        const isHttps = parsed.protocol === 'https:';
        const mod = isHttps ? https : http;
        const defaultPort = isHttps ? 443 : 80;

        const req = mod.request(
            {
                hostname: parsed.hostname,
                port: parseInt(parsed.port) || defaultPort,
                path: parsed.pathname,
                method: 'POST',
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length,
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Upload fallito (${res.statusCode}): ${data.substring(0, 200)}`));
                    }
                });
            }
        );
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout upload cover art')); });
        req.write(body);
        req.end();
    });
}
