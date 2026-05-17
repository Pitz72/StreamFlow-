import https from 'https';
import http from 'http';

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

    const station = await fetchJson<{ listen_url: string }>(
        `${base}/api/station/${stationId}`,
        apiKey
    );

    // Derive streaming connection info from the public listen_url
    let host = '';
    let port = '8000';
    let mount = '/';

    try {
        const listenUrl = new URL(station.listen_url);
        host = listenUrl.hostname;
        port = listenUrl.port || '8000';
        mount = listenUrl.pathname || '/';
    } catch {
        const baseUrlParsed = new URL(base);
        host = baseUrlParsed.hostname;
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

    return { host, port, mount, streamers };
}
