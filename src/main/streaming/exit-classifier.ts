/**
 * Traduce l'uscita con errore di FFmpeg in una causa leggibile da chi trasmette.
 *
 * Logica pura (nessuna dipendenza da Electron né dal processo): vive qui e non
 * dentro StreamManager perché è la parte che più facilmente si rompe in silenzio
 * — un messaggio sbagliato manda il DJ a cercare il guasto nel posto sbagliato —
 * e va protetta dai test.
 */

export interface ExitFacts {
    /** Ultimi ~2000 caratteri di stderr, righe di progresso escluse. */
    lastErrorLog: string;
    /** FFmpeg ha stampato almeno una riga di progresso (dati in uscita). */
    streamingStarted: boolean;
    /** Secondi trascorsi dalla prima riga di progresso (0 se mai partito). */
    liveSeconds: number;
    /** Questo processo ha superato la finestra di tenuta ed è stato dichiarato ON AIR. */
    liveConfirmed: boolean;
    /** In questa sessione la diretta è stata confermata almeno una volta. */
    sessionWasLive: boolean;
    port: string;
    mount: string;
    code: number;
}

export interface ExitVerdict {
    reason: string;
    /** Firma del rifiuto credenziali: vale la pena chiedere al server il 401 vero. */
    credentialsSuspect: boolean;
}

// Priorità alla prima riga che contiene un errore riconoscibile
// (es. "401", "Connection refused") — le ultime righe sono spesso
// cleanup noise di FFmpeg (Error muxing, Error writing trailer, ecc.)
const HTTP_ERROR = /\b(40[0-9]|Connection refused|Unauthorized|access denied|No route|Name or service)\b/i;

// Pattern "harbor occupied / wrong port": auth accettata, poi RST
// immediato dal server senza che lo streaming sia mai partito.
// Sintomi: -10053 / WSAECONNABORTED / "Error muxing" e mai un "time="
const DROP_PATTERN = /(10053|WSAECONNABORTED|Error muxing|Connection reset)/i;

// Pattern "kicked": lo stream era PARTITO e il peer ha chiuso con un RST
// (-10054 / WSAECONNRESET) dopo pochi secondi. Non è un guasto di rete
// generico: un taglio così rapido e ripetibile è quasi sempre una
// decisione del server (DJ fuori fascia oraria, doppia connessione sullo
// stesso account) oppure un antivirus che tronca l'upload HTTP continuo.
const RST_PATTERN = /(10054|10053|WSAECONNRESET|WSAECONNABORTED|Connection reset)/i;

export function classifyExit(f: ExitFacts): ExitVerdict {
    const errorLines = f.lastErrorLog.split('\n').map(l => l.trim()).filter(l => l);
    const firstMeaningful = errorLines.find(l => HTTP_ERROR.test(l));
    const earlyDrop = !f.streamingStarted && DROP_PATTERN.test(f.lastErrorLog);
    const kicked = f.streamingStarted && f.liveSeconds <= 30 && RST_PATTERN.test(f.lastErrorLog);

    // Caduto prima della conferma, al primo collegamento della sessione, con
    // un reset di rete: è la firma del rifiuto delle credenziali (25/07/2026).
    const credentialsSuspect = !f.liveConfirmed && !f.sessionWasLive && kicked && f.liveSeconds <= 3;

    let reason: string;
    if (credentialsSuspect) {
        reason = `caduta dopo ${f.liveSeconds}s, prima della conferma. Quasi certamente CREDENZIALI RIFIUTATE: il server risponde "401 Unauthorized" e chiude, ma FFmpeg non legge la risposta e riporta solo un errore di rete. Verifico le credenziali leggendo la risposta vera del server...`;
    } else if (kicked && f.liveSeconds <= 3) {
        // Qui si arriva solo durante una riconnessione (al primo collegamento
        // è il ramo credentialsSuspect): la password ha già funzionato in
        // questa sessione, quindi il sospetto è il server che non accetta
        // ancora il flusso — tipicamente la sorgente vecchia non ancora
        // scaduta sull'harbor.
        reason = `tentativo caduto dopo ${f.liveSeconds}s: il server non accetta ancora il flusso (spesso la connessione precedente non è ancora scaduta). Se succede fino all'ultimo tentativo, usa Configurazione → Diagnostica → "Test connessione".`;
    } else if (kicked) {
        reason = `il server ha chiuso di netto la connessione (RST) dopo ${f.liveSeconds}s di diretta. Cause tipiche: un'altra sorgente collegata sullo stesso account, oppure un antivirus o un intermediario di rete che tronca l'upload HTTP. Usa Configurazione → Diagnostica → "Test connessione" per isolare il punto di rottura.`;
    } else if (earlyDrop) {
        reason = `Server ha chiuso la connessione subito dopo l'auth. Probabile causa: mount/porta sbagliati (stai puntando a Icecast invece che al harbor Liquidsoap?). Verifica che porta=${f.port} e mount=${f.mount} corrispondano a "Icecast Clients" nel pannello AzuraCast → Broadcasting → How do I connect?`;
    } else if (firstMeaningful) {
        reason = firstMeaningful.substring(0, 200);
    } else {
        reason = errorLines.slice(-3).join(' | ') || `Exited with code ${f.code}`;
    }

    return { reason, credentialsSuspect };
}
