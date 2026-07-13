import net from 'net';

/**
 * Client ZMTP 3.1 (mechanism NULL, socket REQ) in puro Node — nessuna dipendenza
 * nativa. Serve a inviare comandi runtime al filtro `azmq` di FFmpeg per cambiare
 * il volume in diretta senza riavviare l'encoder.
 *
 * Protocollo verificato contro il binario ffmpeg-static incluso: una REQ con
 * corpo "all volume <x>" fa rispondere azmq "0 " (successo) e il filtro volume
 * (con eval=frame) applica il nuovo guadagno al frame successivo.
 *
 * Ogni comando apre una connessione usa-e-getta: REQ/REP è one-shot e il costo
 * su loopback è trascurabile.
 */

const HOST = '127.0.0.1';

function buildGreeting(): Buffer {
    const g = Buffer.alloc(64, 0);
    g[0] = 0xff; g[9] = 0x7f;            // signature
    g[10] = 3; g[11] = 1;                // version 3.1
    Buffer.from('NULL').copy(g, 12);     // mechanism (20 byte, zero-padded)
    g[32] = 0;                           // as-server = 0 (client)
    return g;
}

function readyCommand(): Buffer {
    // command "READY" + metadata Socket-Type=REQ (short command frame)
    const body = Buffer.concat([
        Buffer.from([0x05]), Buffer.from('READY'),
        Buffer.from([0x0b]), Buffer.from('Socket-Type'),
        Buffer.from([0x00, 0x00, 0x00, 0x03]), Buffer.from('REQ'),
    ]);
    return Buffer.concat([Buffer.from([0x04, body.length]), body]);
}

function messageFrames(str: string): Buffer {
    const payload = Buffer.from(str, 'utf8');
    const delimiter = Buffer.from([0x01, 0x00]);         // frame vuoto, flag MORE (semantica REQ)
    const bodyHeader = Buffer.from([0x00, payload.length]); // short frame, finale
    return Buffer.concat([delimiter, bodyHeader, payload]);
}

interface Frame { body: Buffer; next: number }

function parseFrame(b: Buffer, off: number): Frame | null {
    if (off + 1 > b.length) return null;
    const flags = b[off];
    const long = (flags & 0x02) !== 0;
    let len: number, hdr: number;
    if (long) {
        if (off + 9 > b.length) return null;
        len = Number(b.readBigUInt64BE(off + 1));
        hdr = 9;
    } else {
        if (off + 2 > b.length) return null;
        len = b[off + 1];
        hdr = 2;
    }
    if (off + hdr + len > b.length) return null;
    return { body: b.subarray(off + hdr, off + hdr + len), next: off + hdr + len };
}

/**
 * Invia un comando al broker azmq e risolve con la risposta testuale del filtro
 * (es. "0 Success"). Rigetta su timeout o errore socket.
 */
export function sendFilterCommand(port: number, command: string, timeoutMs = 3000): Promise<string> {
    return new Promise((resolve, reject) => {
        const sock = new net.Socket();
        let buf = Buffer.alloc(0);
        let phase: 'greeting' | 'handshake' | 'reply' = 'greeting';

        const done = (fn: () => void) => { clearTimeout(timer); try { sock.destroy(); } catch { /* ignore */ } fn(); };
        const timer = setTimeout(() => done(() => reject(new Error('ZMQ timeout'))), timeoutMs);

        sock.connect(port, HOST, () => sock.write(buildGreeting()));

        sock.on('data', (d) => {
            buf = Buffer.concat([buf, d]);

            if (phase === 'greeting') {
                if (buf.length < 64) return;
                buf = buf.subarray(64);
                sock.write(readyCommand());
                phase = 'handshake';
            }
            if (phase === 'handshake') {
                const f = parseFrame(buf, 0);       // consuma il READY del peer
                if (!f) return;
                buf = buf.subarray(f.next);
                sock.write(messageFrames(command));
                phase = 'reply';
            }
            if (phase === 'reply') {
                // REP risponde con delimiter (vuoto) + corpo: servono 2 frame
                let off = 0;
                const frames: Buffer[] = [];
                for (;;) {
                    const f = parseFrame(buf, off);
                    if (!f) break;
                    frames.push(f.body);
                    off = f.next;
                }
                if (frames.length >= 2) {
                    done(() => resolve(frames.map(f => f.toString()).join('').trim()));
                }
            }
        });

        sock.on('error', (e) => done(() => reject(e)));
    });
}

/**
 * Verifica se la porta è libera per il bind di azmq (`tcp://*:port`, tutte le
 * interfacce). Se occupata, il chiamante rinuncia al canale live invece di far
 * fallire lo stream.
 */
export function isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.once('error', () => resolve(false));
        srv.once('listening', () => srv.close(() => resolve(true)));
        srv.listen(port);
    });
}
