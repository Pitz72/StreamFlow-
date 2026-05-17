import http from 'http';

interface MetaConfig {
    host: string;
    port: string;
    user: string;
    password: string;
    mount: string;
}

export class MetadataManager {
    private config: MetaConfig | null = null;

    setConfig(config: MetaConfig) {
        this.config = config;
    }

    clearConfig() {
        this.config = null;
    }

    async send(artist: string, title: string): Promise<void> {
        if (!this.config) throw new Error('Nessuno stream attivo');

        const { host, port, user, password, mount } = this.config;
        const song = artist && title
            ? `${artist} - ${title}`
            : title || artist || '';

        const cleanMount = mount.startsWith('/') ? mount : `/${mount}`;
        // NB: alcuni server (Liquidsoap harbor) sono sensibili all'encoding del mount.
        // Il `/` iniziale lo lasciamo letterale; il resto lo passa sicuro.
        const mountParam = cleanMount === '/'
            ? '/'
            : '/' + cleanMount.slice(1).split('/').map(encodeURIComponent).join('/');
        const path = `/admin/metadata?mount=${mountParam}&mode=updinfo&song=${encodeURIComponent(song)}`;
        const auth = Buffer.from(`${user || 'source'}:${password}`).toString('base64');

        return new Promise((resolve, reject) => {
            const req = http.request(
                {
                    host,
                    port: parseInt(port, 10),
                    path,
                    method: 'GET',
                    headers: {
                        Authorization: `Basic ${auth}`,
                        'User-Agent': 'FMLE/3.0',
                    },
                },
                (res) => {
                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk: string) => { body += chunk; });
                    res.on('end', () => {
                        const status = res.statusCode ?? 0;
                        const bodyTrim = body.trim();
                        const bodyLow = bodyTrim.toLowerCase();

                        console.log(`[MetadataManager] ${host}:${port}${path} → HTTP ${status}, body[0..200]="${bodyTrim.substring(0, 200)}"`);

                        if (status >= 400) {
                            return reject(new Error(`HTTP ${status} — ${bodyTrim.substring(0, 150)}`));
                        }

                        // Se il body è una pagina HTML, l'endpoint /admin/metadata non è gestito
                        // dal server (es. harbor Liquidsoap senza supporto metadata).
                        if (bodyLow.startsWith('<!doctype') || bodyLow.startsWith('<html')) {
                            return reject(new Error(
                                'Il server ha risposto con HTML invece dello XML Icecast — questo harbor/server non supporta /admin/metadata. I metadati non verranno applicati.'
                            ));
                        }

                        // Icecast risponde con XML: <iceresponse><return>1</return>...
                        // <return>0</return> = errore (mount inesistente, auth ko, ecc).
                        if (/<return>\s*0\s*<\/return>/i.test(bodyTrim)) {
                            const msgMatch = bodyTrim.match(/<message>([^<]*)<\/message>/i);
                            const msg = msgMatch ? msgMatch[1].trim() : 'rifiutato dal server';
                            return reject(new Error(`Icecast: ${msg}`));
                        }

                        // Tutto ok: o XML con <return>1</return>, o body vuoto con status 2xx
                        // (alcuni harbor non rispondono nulla ma accettano).
                        resolve();
                    });
                }
            );
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Timeout invio metadati'));
            });
            req.end();
        });
    }
}
