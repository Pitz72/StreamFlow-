/**
 * Macchina a stati di StreamManager, con FFmpeg simulato.
 *
 * Il processo FFmpeg è un finto EventEmitter: i test gli fanno "stampare" le
 * stesse righe di stderr viste sul campo e decidono quando muore. Gli orologi
 * sono finti, così i 3s di tenuta, il minuto di stabilità e i ritardi di
 * riconnessione si attraversano in un istante.
 *
 * Il caso da cui nasce questo file: con password errata FFmpeg stampa una riga
 * di progresso ~0,65s prima del reset, e fino alla 0.8.4 bastava a dichiarare
 * ON AIR, salvare la password sbagliata e riconnettere all'infinito (sempre 1/5).
 */
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeProc extends EventEmitter {
    stderr: EventEmitter;
    stdin: EventEmitter & { writable: boolean; destroyed: boolean; writableLength: number; write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    pid: number;
    args: string[];
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({
    procs: [] as unknown[],
    powerStart: vi.fn(() => 42),
    powerStop: vi.fn(),
    deletePassword: vi.fn(),
    httpAuthCheck: vi.fn(),
    exec: vi.fn(),
    portFree: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('electron', () => ({
    app: { getPath: () => '/tmp', getVersion: () => '0.0.0-test' },
    BrowserWindow: class {},
    powerSaveBlocker: { start: h.powerStart, stop: h.powerStop, isStarted: () => true },
}));
vi.mock('ffmpeg-static', () => ({ default: '/fake/ffmpeg' }));
// La registrazione locale crea la cartella in Documenti: nei test non si tocca il disco.
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return { ...actual, default: { ...actual, mkdirSync: vi.fn() } };
});
vi.mock('child_process', async () => {
    const { EventEmitter: EE } = await import('events');
    return {
        spawn: (_cmd: string, args: string[]) => {
            const p = new EE() as FakeProc;
            p.args = args;
            p.stderr = new EE();
            const stdin = new EE() as FakeProc['stdin'];
            stdin.writable = true;
            stdin.destroyed = false;
            stdin.writableLength = 0;
            stdin.write = vi.fn();
            stdin.end = vi.fn();
            p.stdin = stdin;
            p.pid = 1000 + h.procs.length;
            p.killed = false;
            p.kill = vi.fn();
            h.procs.push(p);
            return p;
        },
        exec: h.exec,
        execSync: vi.fn(),
    };
});
vi.mock('../zmq-command', () => ({
    isPortFree: h.portFree,
    sendFilterCommand: vi.fn(),
}));
vi.mock('../../file-logger', () => ({ writeRaw: vi.fn(), writeLog: vi.fn() }));
vi.mock('../../credentials', () => ({ deletePassword: h.deletePassword }));
vi.mock('../connection-diagnostic', () => ({ httpAuthCheck: h.httpAuthCheck }));

import { StreamManager } from '../ffmpeg-manager';

const PROGRESS = 'size=       8kB time=00:00:00.65 bitrate= 100.9kbits/s speed=   1x';
const RESET = 'Error muxing a packet\nError writing trailer: Error number -10054 occurred\nConversion failed!';

const baseConfig = {
    inputDeviceName: 'Microfono USB',
    host: 'player.example',
    port: '8005',
    password: 'segreta',
    mount: '/',
    icecastUser: 'dj',
    bitrate: '192',
    inputGain: '100',
};

let statuses: Array<[string, string | undefined]>;
let logs: string[];
let sm: StreamManager;

const lastProc = () => h.procs[h.procs.length - 1] as FakeProc;
const say = (p: FakeProc, text: string) => p.stderr.emit('data', Buffer.from(text));
const statusNames = () => statuses.map(([s]) => s);
const flush = () => vi.advanceTimersByTimeAsync(0);

/** Avvia e attende lo spawn (launch è asincrono per il controllo della porta ZMQ). */
const startSession = async (extra: Partial<typeof baseConfig & { mixMode: boolean; recordLocal: boolean }> = {}) => {
    await sm.start({ ...baseConfig, ...extra });
    await flush();
    return lastProc();
};

/** Progresso, tenuta di 3s superata: la diretta è confermata. */
const goLive = async (p: FakeProc) => {
    say(p, PROGRESS);
    await vi.advanceTimersByTimeAsync(3000);
};

/** Il server chiude con un reset dopo `afterMs` di trasmissione. */
const resetAfter = async (p: FakeProc, afterMs: number) => {
    say(p, PROGRESS);
    await vi.advanceTimersByTimeAsync(afterMs);
    say(p, RESET);
    p.emit('close', 1);
    await flush();
};

beforeEach(() => {
    vi.useFakeTimers();
    h.procs.length = 0;
    h.powerStart.mockClear();
    h.powerStop.mockClear();
    h.deletePassword.mockClear();
    h.httpAuthCheck.mockReset();
    h.exec.mockClear();
    h.portFree.mockClear();
    h.httpAuthCheck.mockResolvedValue({ status: 401, text: 'CREDENZIALI RIFIUTATE (401)' });
    statuses = [];
    logs = [];
    const fakeWindow = {
        isDestroyed: () => false,
        webContents: { send: (_ch: string, status: string, msg?: string) => statuses.push([status, msg]) },
    };
    sm = new StreamManager(fakeWindow as never);
    sm.setLogSink((_lvl, msg) => logs.push(msg));
});

afterEach(() => {
    sm.stop(true);
    vi.useRealTimers();
});

describe('password errata (il caso del 25/07/2026)', () => {
    it('non dichiara mai ON AIR e non riconnette', async () => {
        const p = await startSession();
        await resetAfter(p, 650);
        await vi.advanceTimersByTimeAsync(130_000); // più di tutto il backoff

        expect(statusNames()).not.toContain('connected');
        expect(statusNames()).not.toContain('reconnecting');
        expect(statusNames()).toContain('error');
        expect(h.procs).toHaveLength(1); // nessun secondo FFmpeg
    });

    it('chiede al server la risposta vera e con un 401 cancella la password memorizzata', async () => {
        const p = await startSession();
        await resetAfter(p, 650);
        await flush();

        expect(h.httpAuthCheck).toHaveBeenCalledTimes(1);
        expect(h.deletePassword).toHaveBeenCalledWith('dj');
        expect(statuses.at(-1)?.[1]).toMatch(/Password rifiutata.*401/);
    });

    it('senza un 401 certo non cancella niente', async () => {
        h.httpAuthCheck.mockResolvedValue({ status: 200, text: 'credenziali accettate (200)' });
        const p = await startSession();
        await resetAfter(p, 650);
        await flush();

        expect(h.deletePassword).not.toHaveBeenCalled();
    });
});

describe('conferma della diretta', () => {
    it('ON AIR solo dopo 3s di trasmissione continua', async () => {
        const p = await startSession();
        say(p, PROGRESS);
        await vi.advanceTimersByTimeAsync(2900);
        expect(statusNames()).not.toContain('connected');

        await vi.advanceTimersByTimeAsync(200);
        expect(statusNames()).toContain('connected');
    });

    it('un errore di connessione al primo collegamento chiude la sessione senza ritentare', async () => {
        const p = await startSession();
        say(p, '[tcp] Connection to tcp://player.example:8005 failed: Connection refused');
        p.emit('close', 1);
        await vi.advanceTimersByTimeAsync(10_000);

        expect(statusNames()).toContain('error');
        expect(statusNames()).not.toContain('reconnecting');
        expect(sm.isSessionActive()).toBe(false);
    });
});

describe('riconnessione automatica', () => {
    it('dopo una diretta confermata i tentativi arrivano a 5/5 e poi si fermano', async () => {
        const first = await startSession();
        await goLive(first);
        await resetAfter(first, 2000);

        for (let attempt = 1; attempt <= 5; attempt++) {
            const announce = statuses.filter(([s]) => s === 'reconnecting').at(-1)?.[1] ?? '';
            expect(announce).toContain(`tentativo ${attempt}/5`);
            await vi.advanceTimersByTimeAsync(StreamManagerDelays[attempt - 1]);
            await flush();
            await resetAfter(lastProc(), 800); // ogni tentativo cade prima della conferma
        }

        expect(statuses.at(-1)?.[0]).toBe('error');
        expect(statuses.at(-1)?.[1]).toMatch(/dopo 5 tentativi/);
        expect(sm.isSessionActive()).toBe(false);
    });

    it('un tentativo con "Connection refused" passa al successivo invece di chiudere', async () => {
        const first = await startSession();
        await goLive(first);
        await resetAfter(first, 2000);

        await vi.advanceTimersByTimeAsync(StreamManagerDelays[0]);
        await flush();
        const retry = lastProc();
        say(retry, 'Connection refused');
        retry.emit('close', 1);
        await flush();

        expect(statusNames()).not.toContain('error');
        expect(statuses.at(-1)?.[1]).toContain('tentativo 2/5');
    });

    it('il contatore si azzera solo dopo un minuto di diretta stabile', async () => {
        const first = await startSession();
        await goLive(first);
        await resetAfter(first, 2000);            // → 1/5

        await vi.advanceTimersByTimeAsync(StreamManagerDelays[0]);
        await flush();
        const second = lastProc();
        await goLive(second);
        await resetAfter(second, 10_000);         // in onda 13s: niente azzeramento → 2/5
        expect(statuses.at(-1)?.[1]).toContain('tentativo 2/5');

        await vi.advanceTimersByTimeAsync(StreamManagerDelays[1]);
        await flush();
        const third = lastProc();
        await goLive(third);
        await vi.advanceTimersByTimeAsync(60_000); // minuto stabile
        say(third, RESET);
        third.emit('close', 1);
        await flush();
        expect(statuses.at(-1)?.[1]).toContain('tentativo 1/5');
    });
});

describe('MIX MODE', () => {
    it('senza audio dal mixer: errore dopo 5s, mai ON AIR', async () => {
        await startSession({ mixMode: true });
        await vi.advanceTimersByTimeAsync(5000);

        expect(statusNames()).not.toContain('connected');
        expect(statuses.at(-1)?.[0]).toBe('error');
        expect(statuses.at(-1)?.[1]).toMatch(/mixer non produce audio/);
        expect(sm.isSessionActive()).toBe(false);
    });

    it('con audio dal mixer e server lento: nessun errore, nessuno stato presunto', async () => {
        await startSession({ mixMode: true });
        sm.writeAudioChunk(Buffer.alloc(8192));
        await vi.advanceTimersByTimeAsync(8000);

        expect(statusNames()).toEqual(['connecting']);
    });
});

describe('standby del computer', () => {
    it('bloccato per tutta la sessione, rilasciato alla fine', async () => {
        const p = await startSession();
        expect(h.powerStart).toHaveBeenCalledTimes(1);
        expect(sm.isSessionActive()).toBe(true);

        await goLive(p);
        expect(h.powerStart).toHaveBeenCalledTimes(1); // nessun doppio blocco

        sm.stop();
        expect(h.powerStop).toHaveBeenCalledTimes(1);
        expect(sm.isSessionActive()).toBe(false);
    });

    it('resta bloccato durante l\'attesa della riconnessione', async () => {
        const p = await startSession();
        await goLive(p);
        await resetAfter(p, 2000);

        expect(statuses.at(-1)?.[0]).toBe('reconnecting');
        expect(h.powerStop).not.toHaveBeenCalled();
        expect(sm.isSessionActive()).toBe(true);
    });
});

describe('riallineamento dell\'interfaccia', () => {
    it('conserva l\'ultimo stato inviato', async () => {
        const p = await startSession();
        await goLive(p);
        expect(sm.getStatusSnapshot().status).toBe('connected');
    });
});

/** Gli stessi ritardi di StreamManager (5s → 10s → 30s → 60s → 120s). */
const StreamManagerDelays = [5000, 10000, 30000, 60000, 120000];

// Righe vere di ffmpeg-static (29/10/2026): server che chiude con un reset a
// diretta avviata, e porta senza servizio.
const TEE_RESET = '[tee @ 0000025e5bb0d880] Slave muxer #0 failed: Error number -10054 occurred, continuing with 1/2 slaves.';
const TEE_UNREACHABLE = [
    '[tcp @ 0000020e1b390400] Connection to tcp://player.example:8005 failed: Error number -138 occurred',
    "[tee @ 0000020e1b2fd880] Slave '[f=mp3]http://player.example:8005/': error opening: Error number -138 occurred",
    '[tee @ 0000020e1b2fd880] Slave muxer #0 failed: Error number -138 occurred, continuing with 1/2 slaves.',
    'size=       0kB time=N/A bitrate=N/A speed=N/A',
].join('\n');
const taskkills = () => h.exec.mock.calls.filter(([cmd]) => String(cmd).startsWith('taskkill'));

describe('registrazione locale (muxer tee)', () => {
    it('password errata: il tee che prosegue col solo file non diventa un ON AIR', async () => {
        const p = await startSession({ recordLocal: true });
        say(p, PROGRESS);
        await vi.advanceTimersByTimeAsync(650);
        say(p, TEE_RESET);
        // Il processo viene chiuso, non lasciato a registrare: prima con le buone
        // (la registrazione fin lì resta integra), poi con il kill di riserva.
        expect(p.stdin.write).toHaveBeenCalledWith('q');
        await vi.advanceTimersByTimeAsync(3000);
        expect(taskkills()).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(2000);
        p.emit('close', 0); // uscita pulita dopo il 'q': la causa è il reset già letto
        await flush();

        expect(statusNames()).not.toContain('connected');
        expect(statusNames()).toContain('error');
        expect(h.httpAuthCheck).toHaveBeenCalledTimes(1);
    });

    it('caduta a diretta avviata: riconnessione, non ON AIR muto', async () => {
        const p = await startSession({ recordLocal: true });
        await goLive(p);
        await vi.advanceTimersByTimeAsync(20_000);
        say(p, TEE_RESET);
        p.emit('close', 1);
        await flush();

        expect(statuses.at(-1)?.[0]).toBe('reconnecting');
    });

    it('un tentativo di riconnessione con il server ancora giù passa al successivo', async () => {
        const p = await startSession({ recordLocal: true });
        await goLive(p);
        await resetAfter(p, 20_000);
        await vi.advanceTimersByTimeAsync(5000);

        const retry = lastProc();
        expect(retry).not.toBe(p);
        say(retry, TEE_UNREACHABLE);
        retry.emit('close', 1);
        await flush();

        expect(statuses.at(-1)?.[0]).toBe('reconnecting');
        expect(statuses.at(-1)?.[1]).toMatch(/tentativo 2\/5/);
        expect(sm.isSessionActive()).toBe(true);
    });

    it('server irraggiungibile al primo collegamento: errore che lo dice', async () => {
        const p = await startSession({ recordLocal: true });
        say(p, TEE_UNREACHABLE);
        p.emit('close', 1);
        await flush();

        expect(statuses.at(-1)?.[0]).toBe('error');
        expect(statuses.at(-1)?.[1]).toMatch(/nessuna risposta dal server sulla porta 8005/);
    });
});

describe('nessuno stato presunto', () => {
    it('server che non risponde: mai ON AIR, tentativo chiuso dopo 15s', async () => {
        const p = await startSession();
        await vi.advanceTimersByTimeAsync(5500); // il punto in cui la 0.8.6 accendeva ON AIR
        expect(statusNames()).toEqual(['connecting']);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(p.stdin.write).toHaveBeenCalledWith('q');
        p.emit('close', 0);
        await flush();

        expect(statusNames()).not.toContain('connected');
        expect(statuses.at(-1)?.[0]).toBe('error');
        expect(statuses.at(-1)?.[1]).toMatch(/nessuna trasmissione partita/);
    });
});

describe('uscita senza errori non richiesta', () => {
    it('a diretta avviata (dispositivo sparito) è una caduta: riconnessione', async () => {
        const p = await startSession();
        await goLive(p);
        p.emit('close', 0);
        await flush();

        expect(statuses.at(-1)?.[0]).toBe('reconnecting');
        expect(logs.join('\n')).toMatch(/sorgente audio si è interrotta/);
    });

    it('al primo collegamento è un errore visibile, non "Ready"', async () => {
        const p = await startSession();
        p.emit('close', 0);
        await flush();

        expect(statuses.at(-1)?.[0]).toBe('error');
    });
});

describe('arresto chiesto dall\'utente', () => {
    it('pulito: "q" a FFmpeg, taskkill solo se non esce entro 3s', async () => {
        const p = await startSession();
        await goLive(p);
        sm.stop();

        expect(p.stdin.write).toHaveBeenCalledWith('q');
        expect(statuses.at(-1)?.[0]).toBe('disconnected');
        expect(taskkills()).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(3000);
        expect(taskkills()).toHaveLength(1);
    });

    it('in MIX MODE basta la fine di stdin', async () => {
        const p = await startSession({ mixMode: true });
        sm.writeAudioChunk(Buffer.alloc(8192));
        sm.stop();

        expect(p.stdin.end).toHaveBeenCalled();
        expect(p.stdin.write).not.toHaveBeenCalledWith('q');
    });

    it('un nuovo avvio chiude subito il processo ancora in chiusura', async () => {
        const p = await startSession();
        await goLive(p);
        sm.stop();
        await startSession();

        expect(taskkills().some(([cmd]) => String(cmd).includes(`/pid ${p.pid} `))).toBe(true);
    });
});

describe('volume in diretta', () => {
    it('il canale azmq ascolta solo sul computer, non sulla rete locale', async () => {
        h.portFree.mockResolvedValueOnce(true);
        const p = await startSession();
        const af = p.args[p.args.indexOf('-af') + 1];

        expect(af).toContain(String.raw`bind_address='tcp\://127.0.0.1\:5555'`);
    });
});

describe('password con lettere accentate (L10)', () => {
    // AzuraCast passa utente e password, come escono dall'header, alla sua API in
    // JSON e li confronta con l'hash salvato dal pannello web: in UTF-8. In
    // latin-1 "è" diventerebbe un byte non valido e la password non tornerebbe mai.
    const basicOf = (headers: string) => {
        // Nel tee i ':' dell'header arrivano protetti ("Authorization\\: Basic");
        // la base64 non contiene caratteri da proteggere.
        const m = /Authorization\\*: Basic ([A-Za-z0-9+/=]+)/.exec(headers);
        return m ? Buffer.from(m[1], 'base64') : null;
    };

    it('arriva al server in UTF-8, senza registrazione', async () => {
        const p = await startSession({ icecastUser: 'dj', password: 'pàsswörd€' });
        const headers = p.args[p.args.indexOf('-headers') + 1];

        expect(basicOf(headers)).toEqual(Buffer.from('dj:pàsswörd€', 'utf8'));
    });

    it('arriva al server in UTF-8 anche dentro il muxer tee', async () => {
        const p = await startSession({ icecastUser: 'dj', password: 'pàsswörd€', recordLocal: true });
        const tee = p.args[p.args.indexOf('tee') + 1];

        expect(basicOf(tee)).toEqual(Buffer.from('dj:pàsswörd€', 'utf8'));
    });
});

describe("uscita dall'app", () => {
    it("aspetta l'arresto pulito prima di uscire", async () => {
        const p = await startSession();
        await goLive(p);
        let done = false;
        const quitting = sm.stopForQuit().then(() => { done = true; });

        expect(p.stdin.write).toHaveBeenCalledWith('q');
        await flush();
        expect(done).toBe(false);

        p.emit('close', 0);
        await quitting;
        expect(done).toBe(true);
        expect(taskkills()).toHaveLength(0);
    });

    it('se FFmpeg non esce, lo chiude comunque dopo 3s', async () => {
        const p = await startSession();
        await goLive(p);
        const quitting = sm.stopForQuit();
        await vi.advanceTimersByTimeAsync(3000);
        await quitting;

        expect(p.stdin.write).toHaveBeenCalledWith('q');
    });
});
