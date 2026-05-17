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
        if (!this.config) throw new Error('No active stream config');

        const { host, port, user, password, mount } = this.config;
        const song = artist && title
            ? `${artist} - ${title}`
            : title || artist || '';

        const cleanMount = mount.startsWith('/') ? mount : `/${mount}`;
        const path = `/admin/metadata?mount=${encodeURIComponent(cleanMount)}&mode=updinfo&song=${encodeURIComponent(song)}`;
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
                    res.resume(); // drain response body
                    if (res.statusCode && res.statusCode < 400) {
                        resolve();
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                }
            );
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Metadata request timeout'));
            });
            req.end();
        });
    }
}
