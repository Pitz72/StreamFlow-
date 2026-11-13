/**
 * Quando un passaggio di stato merita un avviso fuori dalla finestra (G13).
 * Logica pura: nessuna dipendenza da Electron.
 */
import { describe, expect, it } from 'vitest';
import { AlertPolicy, shortReason } from '../alert-policy';

const kinds = (actions: Array<{ kind: string }>) => actions.map((a) => a.kind);

describe('avvisi fuori dalla finestra (G13)', () => {
    it('una caduta avvisa una volta sola, per quanti tentativi ci vogliano', () => {
        const p = new AlertPolicy();
        const seen = [
            p.onStatus('connecting'),
            p.onStatus('connected'),
            p.onStatus('reconnecting', 'Riconnessione tra 5s (tentativo 1/5)'),
            p.onStatus('reconnecting', 'Riconnessione tra 4s (tentativo 1/5)'),
            p.onStatus('connecting'),                 // il tentativo parte
            p.onStatus('reconnecting', 'Riconnessione tra 10s (tentativo 2/5)'),
            p.onStatus('connecting'),
            p.onStatus('connected'),
        ];

        expect(kinds(seen)).toEqual(['clear', 'none', 'lost', 'none', 'none', 'none', 'none', 'restored']);
    });

    it('lo stop definitivo della riconnessione dice che non si è in onda, con la causa', () => {
        const p = new AlertPolicy();
        p.onStatus('connecting');
        p.onStatus('connected');
        p.onStatus('reconnecting');
        const down = p.onStatus('error', 'Connessione persa: riconnessione fallita dopo 5 tentativi.');

        expect(down).toEqual({ kind: 'down', reason: 'Connessione persa: riconnessione fallita dopo 5 tentativi.' });
        // La sessione dopo riparte pulita: una nuova caduta avvisa di nuovo.
        expect(p.onStatus('connecting').kind).toBe('clear');
        p.onStatus('connected');
        expect(p.onStatus('reconnecting').kind).toBe('lost');
    });

    it('arresto voluto e nuovo avvio tolgono gli avvisi', () => {
        const p = new AlertPolicy();
        p.onStatus('connecting');
        p.onStatus('connected');

        expect(p.onStatus('disconnected').kind).toBe('clear');
        expect(p.onStatus('connecting').kind).toBe('clear');
    });

    it('audio fermo: un avviso per pausa, tolto quando riparte', () => {
        const p = new AlertPolicy();
        p.onStatus('connecting');
        p.onStatus('connected');
        const seen = [p.onStall(5), p.onStall(6), p.onStall(7), p.onStall(null), p.onStall(null), p.onStall(5)];

        expect(seen[0]).toEqual({ kind: 'stall', seconds: 5 });
        expect(kinds(seen)).toEqual(['stall', 'none', 'none', 'clear', 'none', 'stall']);
    });

    it('audio fermo fino alla chiusura: l\'avviso della pausa lascia il posto a quello della caduta', () => {
        const p = new AlertPolicy();
        p.onStatus('connecting');
        p.onStatus('connected');
        p.onStall(5);
        // Il cane da guardia chiude il processo: prima toglie la pausa, poi arriva la caduta.
        expect(p.onStall(null).kind).toBe('clear');
        expect(p.onStatus('reconnecting').kind).toBe('lost');
        // Dentro la caduta una pausa che finisce non spegne l'avviso della caduta.
        p.onStall(5);
        expect(p.onStall(null).kind).toBe('none');
    });
});

describe('testo breve per la notifica', () => {
    it('toglie il prefisso tecnico e accorcia', () => {
        expect(shortReason('FFmpeg: nessuna risposta dal server sulla porta 8005')).toBe('nessuna risposta dal server sulla porta 8005');
        const long = shortReason(`FFmpeg: ${'parola '.repeat(80)}`, 100);
        expect(long.length).toBeLessThanOrEqual(100);
        expect(long.endsWith('…')).toBe(true);
    });

    it('senza causa dà un testo che si capisce da solo', () => {
        expect(shortReason(undefined)).toMatch(/Apri StreamFlow/);
        expect(shortReason('   ')).toMatch(/Apri StreamFlow/);
    });
});
