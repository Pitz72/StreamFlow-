/**
 * Logica pura del percorso di trasmissione: messaggi d'errore, escaping del
 * muxer tee, lettura delle risposte del server metadata, redazione dei log.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: { getPath: () => '/tmp', getVersion: () => '0.0.0-test' },
    BrowserWindow: class {},
    powerSaveBlocker: { start: vi.fn(), stop: vi.fn(), isStarted: vi.fn() },
    shell: { openPath: vi.fn() },
}));
vi.mock('ffmpeg-static', () => ({ default: '/fake/ffmpeg' }));

import { classifyExit, type ExitFacts } from '../exit-classifier';
import { teeEscapeOptionValue, teeEscapePath } from '../ffmpeg-manager';
import { evaluateResponse, parseRawHttpResponse } from '../metadata-manager';
import { redact } from '../../file-logger';
import { SendMonitor, isDshowDrop, parseProgress, stallMessage, SUMMARY_MS } from '../send-monitor';

const RESET_LOG = 'Error muxing a packet\nError writing trailer: Error number -10054 occurred\nConversion failed!';

const facts = (over: Partial<ExitFacts>): ExitFacts => ({
    lastErrorLog: '',
    streamingStarted: false,
    liveSeconds: 0,
    liveConfirmed: false,
    sessionWasLive: false,
    port: '8005',
    mount: '/',
    code: 1,
    ...over,
});

describe('classifyExit', () => {
    it('reset entro 3s al primo collegamento → sospetto credenziali', () => {
        const v = classifyExit(facts({ lastErrorLog: RESET_LOG, streamingStarted: true, liveSeconds: 1 }));
        expect(v.credentialsSuspect).toBe(true);
        expect(v.reason).toMatch(/CREDENZIALI RIFIUTATE/);
    });

    it('lo stesso reset durante una riconnessione NON accusa la password', () => {
        const v = classifyExit(facts({ lastErrorLog: RESET_LOG, streamingStarted: true, liveSeconds: 1, sessionWasLive: true }));
        expect(v.credentialsSuspect).toBe(false);
        expect(v.reason).toMatch(/non accetta ancora il flusso/);
    });

    it('reset dopo 20s di diretta → taglio del server o dell\'antivirus', () => {
        const v = classifyExit(facts({ lastErrorLog: RESET_LOG, streamingStarted: true, liveSeconds: 20, liveConfirmed: true, sessionWasLive: true }));
        expect(v.credentialsSuspect).toBe(false);
        expect(v.reason).toMatch(/dopo 20s di diretta/);
    });

    it('chiusura prima di ogni dato → porta o mount sbagliati', () => {
        const v = classifyExit(facts({ lastErrorLog: 'Error muxing a packet', port: '8000', mount: '/radio.mp3' }));
        expect(v.reason).toMatch(/porta=8000 e mount=\/radio\.mp3/);
    });

    it('preferisce la riga con l\'errore HTTP al rumore finale', () => {
        const v = classifyExit(facts({ lastErrorLog: 'Server returned 403 Forbidden (access denied)\nConversion failed!' }));
        expect(v.reason).toBe('Server returned 403 Forbidden (access denied)');
    });

    it('server irraggiungibile su Windows ("Error number -138") → lo dice in chiaro', () => {
        const v = classifyExit(facts({ lastErrorLog: 'Connection to tcp://player.example:8005 failed: Error number -138 occurred' }));
        expect(v.reason).toMatch(/nessuna risposta dal server sulla porta 8005/);
        expect(v.credentialsSuspect).toBe(false);
    });

    it('senza niente di riconoscibile riporta il codice d\'uscita', () => {
        expect(classifyExit(facts({ code: 3 })).reason).toBe('Exited with code 3');
    });
});

describe('escaping del muxer tee', () => {
    it('i due punti degli header arrivano al secondo livello ancora protetti', () => {
        expect(teeEscapeOptionValue('User-Agent: FMLE/3.0')).toBe('User-Agent\\\\: FMLE/3.0');
    });

    it('protegge i separatori degli slave', () => {
        expect(teeEscapeOptionValue('a|b[c]')).toBe('a\\\\|b\\\\[c\\\\]');
    });

    it('i percorsi Windows diventano con barre normali, i separatori protetti', () => {
        expect(teeEscapePath('C:\\Utenti\\Dj|1\\[x].mp3')).toBe('C:/Utenti/Dj\\|1/\\[x\\].mp3');
    });
});

describe('risposte del server metadata', () => {
    const judge = (raw: string) => evaluateResponse('GET ...', raw, parseRawHttpResponse(raw));

    it('Liquidsoap: 200 con corpo vuoto = accettato', () => {
        expect(judge('HTTP/1.0 200 OK\r\n\r\n').ok).toBe(true);
    });

    it('Icecast XML <return>1</return> = accettato', () => {
        expect(judge('HTTP/1.0 200 OK\r\nContent-Type: text/xml\r\n\r\n<iceresponse><return>1</return></iceresponse>').ok).toBe(true);
    });

    it('Icecast XML <return>0</return> = rifiutato, con il messaggio del server', () => {
        const r = judge('HTTP/1.0 200 OK\r\n\r\n<iceresponse><message>Mountpoint will not accept</message><return>0</return></iceresponse>');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/Mountpoint will not accept/);
    });

    it('401 = rifiutato', () => {
        const r = judge('HTTP/1.0 401 Unauthorized\r\n\r\nYou need to authenticate');
        expect(r.ok).toBe(false);
        expect(r.httpStatus).toBe(401);
    });

    it('risposta non HTTP = errore esplicito', () => {
        expect(judge('garbage').error).toBe('Risposta non HTTP valida');
    });
});

describe('redazione del file di log', () => {
    it('cancella l\'header Authorization', () => {
        expect(redact('Authorization: Basic ZGo6c2VncmV0YQ==')).toBe('Authorization: Basic ***REDACTED***');
    });

    it('cancella le password in chiaro', () => {
        expect(redact('password=segreta&x=1')).not.toContain('segreta');
    });

    it('cancella le credenziali dentro un URL', () => {
        expect(redact('http://dj:segreta@host:8005/')).toBe('http://***REDACTED***@host:8005/');
    });
});

describe("sorveglianza dell'invio (diretta del 6/11/2026)", () => {
    const DROP_LINE = '[dshow @ 000002a56d46c000] real-time buffer [Microfono (RODECaster Pro II Main Multitrack)] [audio input] too full or near too full (63% of size: 3041280 [rtbufsize parameter])! frame dropped!';
    const at = (outSec: number) => ({ kB: Math.round(outSec * 24), outSec, kbps: 192 });

    it('legge le righe di progresso di FFmpeg', () => {
        expect(parseProgress('size=     470kB time=00:00:19.98 bitrate= 192.5kbits/s speed=1.02x'))
            .toEqual({ kB: 470, outSec: 19.98, kbps: 192.5 });
        expect(parseProgress('size=   18003kB time=01:02:03.50 bitrate= 192.0kbits/s speed=   1x')?.outSec).toBeCloseTo(3723.5);
        expect(parseProgress('size=       0kB time=N/A bitrate=N/A speed=N/A')).toBeNull();
        expect(parseProgress('Press [q] to stop')).toBeNull();
    });

    it("riconosce l'audio scartato da dshow", () => {
        expect(isDshowDrop(DROP_LINE)).toBe(true);
        expect(isDshowDrop('Stream mapping: Stream #0:0 -> #0:0')).toBe(false);
    });

    it("segnala una pausa nell'invio, ma non un ritardo nostro", () => {
        const m = new SendMonitor();
        expect(m.progress(at(3), 0, false)).toEqual({});
        expect(m.progress(at(3.5), 500, false).stallSec).toBeUndefined();
        expect(m.progress(at(4), 9500, false).stallSec).toBe(9);
        // righe arrivate nello stesso blocco: era occupato il processo principale
        expect(m.progress(at(4.5), 20000, true).stallSec).toBeUndefined();
        expect(stallMessage(9)).toContain('9,0 secondi');
    });

    it('scrive ogni minuto il riassunto con il ritardo accumulato', () => {
        const m = new SendMonitor();
        m.progress(at(3), 0, false);
        expect(m.progress(at(30), 30000, false).summary).toBeUndefined();
        const r = m.progress(at(60.5), SUMMARY_MS, false);
        expect(r.summary).toContain('in onda da 1:00');
        expect(r.summary).toContain('ritardo accumulato 2,5 s');
        expect(r.summary).toContain('192 kbit/s');
        expect(m.progress(at(61), SUMMARY_MS + 500, false).summary).toBeUndefined();
    });

    it("avvisa dell'audio scartato al massimo ogni 30 secondi, con il conto", () => {
        const m = new SendMonitor();
        expect(m.drop(0)).toContain("il microfono ha perso un pezzo d'audio");
        expect(m.drop(1000)).toBeNull();
        expect(m.drop(20000)).toBeNull();
        expect(m.drop(31000)).toContain("3 pezzi persi dall'avviso precedente");
        const r = (m.progress(at(0), 40000, false), m.progress(at(60), 40000 + SUMMARY_MS, false));
        expect(r.summary).toContain('audio scartato 4 volte');
    });
});
