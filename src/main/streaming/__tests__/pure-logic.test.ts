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
