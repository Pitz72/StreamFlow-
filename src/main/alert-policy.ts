/**
 * Quando avvisare chi trasmette FUORI dalla finestra di StreamFlow.
 *
 * Lo speaker che si fa la regia da solo guarda Live Machine Pro, non StreamFlow.
 * Fino alla 0.10.3 una caduta, lo «stop definitivo» della riconnessione e gli
 * avvisi di pausa esistevano solo dentro la finestra: con StreamFlow coperto o
 * ridotto a icona si poteva parlare a nessuno per tutta la puntata.
 *
 * Qui c'è solo la decisione (logica pura, protetta dai test): quale passaggio di
 * stato merita un avviso, e quale no perché ne ripeterebbe uno già dato. Il
 * come (notifica di Windows, pulsante sulla barra) sta in `alerts.ts`.
 */

export type SessionStatus = 'connecting' | 'connected' | 'error' | 'disconnected' | 'reconnecting';

export type AlertAction =
    | { kind: 'none' }
    /** La diretta è caduta e StreamFlow sta riprovando. */
    | { kind: 'lost' }
    /** Di nuovo in onda dopo una caduta. */
    | { kind: 'restored' }
    /** La sessione è finita con un errore: non si è in onda. */
    | { kind: 'down'; reason?: string }
    /** A diretta confermata l'audio non esce da `seconds` secondi. */
    | { kind: 'stall'; seconds: number }
    /** Tutto regolare (arresto voluto, nuovo avvio, pausa finita): via gli avvisi. */
    | { kind: 'clear' };

const NONE: AlertAction = { kind: 'none' };

export class AlertPolicy {
    /** Caduta in corso: i tentativi di riconnessione non avvisano di nuovo. */
    private outage = false;
    /** Pausa dell'audio già segnalata: un solo avviso per pausa. */
    private stalled = false;

    onStatus(status: SessionStatus, message?: string): AlertAction {
        switch (status) {
            case 'reconnecting':
                // Arriva una volta al secondo (conto alla rovescia) e a ogni tentativo fallito.
                if (this.outage) return NONE;
                this.outage = true;
                this.stalled = false;
                return { kind: 'lost' };
            case 'connecting':
                // Tentativo dentro una caduta: l'avviso della caduta resta.
                if (this.outage) return NONE;
                this.stalled = false;
                return { kind: 'clear' };
            case 'connected':
                if (!this.outage) return NONE;
                this.outage = false;
                return { kind: 'restored' };
            case 'error':
                this.outage = false;
                this.stalled = false;
                return { kind: 'down', reason: message };
            case 'disconnected':
                this.outage = false;
                this.stalled = false;
                return { kind: 'clear' };
        }
    }

    onStall(seconds: number | null): AlertAction {
        if (seconds === null) {
            if (!this.stalled) return NONE;
            this.stalled = false;
            return this.outage ? NONE : { kind: 'clear' };
        }
        if (this.stalled) return NONE;
        this.stalled = true;
        return { kind: 'stall', seconds };
    }
}

/** Testo breve per la notifica: via il prefisso tecnico, al massimo `max` caratteri. */
export function shortReason(message: string | undefined, max = 220): string {
    const text = (message ?? '').replace(/^FFmpeg:\s*/i, '').replace(/\s+/g, ' ').trim();
    if (!text) return 'La diretta si è fermata per un errore. Apri StreamFlow per i dettagli.';
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
