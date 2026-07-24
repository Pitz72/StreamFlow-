/**
 * Preset ufficiale Runtime Radio — StreamFlow è il client interno della radio.
 *
 * Tutti i parametri di connessione sono FISSI e validati in diretta reale
 * (sessione live del 2026-07-13, v0.6.0): l'utente sceglie solo il proprio
 * nome utente DJ dalla tendina e inserisce la password.
 *
 * Per aggiungere/rimuovere un DJ: aggiornare l'array `djs` e rilasciare una
 * nuova build. I valori harbor (porta 8005, mount "/") corrispondono a
 * AzuraCast → Broadcasting → How do I connect? → Icecast Clients.
 */

export interface DjAccount {
    /** streamer_username AzuraCast (credenziale di connessione). */
    username: string;
    /** Nome mostrato nella tendina. */
    displayName: string;
}

export const STATION_PRESET = {
    stationName: 'Runtime Radio',
    host: 'player.runtimeradio.com',
    /** Porta input harbor Liquidsoap (NON la porta listener Icecast 8000). */
    port: '8005',
    mount: '/',
    bitrate: '192',
    djs: [
        { username: 'AlexGRaccu', displayName: 'Studio Milano 1' },
        { username: 'doomboy', displayName: 'Studio RM 2' },
        { username: 'PixelDebh_Runtime', displayName: 'Studio Runtime Castelli Romani' },
        { username: 'pizzisimone1972@gmail.com', displayName: 'Studio Centrale di Monterotondo' },
    ] as DjAccount[],
} as const;

/** Valore sentinella della tendina per "utente non in elenco". */
export const OTHER_DJ = '__other__';
