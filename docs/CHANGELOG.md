# Changelog StreamFlow

Tutte le modifiche degne di nota sono documentate in questo file.
Formato basato su [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.5.7] — 2026-07-13

### Fixed
- **G1 — Race condition stop→start (audit 2026-07-13).** Il handler `close` del processo FFmpeg azzerava `this.ffmpegProcess` incondizionatamente: il `close` ritardato di un processo appena killato (taskkill è asincrono) poteva cancellare il riferimento al processo **nuovo**, producendo stream orfani non stoppabili dall'app, doppio stream sullo stesso harbor e falso stato "Error" mentre si era live. Ora ogni listener verifica l'identità del processo (`this.ffmpegProcess === proc`) prima di toccare lo stato condiviso.
- **G2 — Error spurio a ogni stop manuale.** `taskkill /f` termina FFmpeg con exit code 1 e il close handler lo trattava come crash (toast d'errore + `✗` nel log dopo ogni stop regolare). Con il guard di identità il close di un processo fermato volontariamente viene ignorato; `stop()` logga "stream fermato" e manda un solo `disconnected`.
- **S1 (bonus) — Volume input 0% diventava 100%.** `parseInt('0') || 100` scartava lo zero (falsy): slider a 0 = mute atteso, ma si andava in onda a volume pieno. Ora il parse usa `Number.isFinite`.
- **S3 (bonus) — Crash alla chiusura dell'app mentre ON AIR.** `sendStatus` ora verifica `isDestroyed()` prima di `webContents.send` (l'eccezione "Object has been destroyed" scattava in `before-quit`).

### Added
- **G3 — Auto-reconnect con backoff esponenziale (Fase C1).** Se lo stream cade dopo essere stato effettivamente live (`code != 0` non richiesto dall'utente), StreamFlow ritenta automaticamente: 5s → 10s → 30s → 60s → 120s, max 5 tentativi, poi errore definitivo. Countdown visibile nell'header (`Riconnessione tra Xs (tentativo N/5)`), nuovo status `reconnecting` (pallino ambra pulsante), eventi loggati nello StreamLog. Il contatore tentativi si azzera appena lo stream torna sano. Durante l'attesa il pulsante ON AIR resta attivo e premendolo si annulla la riconnessione. I fallimenti al **primo** connect (credenziali/porta/mount errati) NON attivano il retry: sono errori di configurazione.

### Changed
- Bump versione 0.5.6 → 0.5.7.

---

## [0.5.6] — 2026-05-17

### Changed
- **Input Volume spostato in home.** Lo slider 0-200% non è più nel modale Configurazione ma direttamente sotto la riga VU + ON AIR, dentro un nuovo componente `InputVolumeControl`. Motivazione: è un controllo che il DJ regola al volo durante la trasmissione, costringerlo ad aprire un modale è scomodo. Il valore corrente si applica al prossimo avvio dello stream (FFmpeg non ricarica i filtri a caldo) — nota esplicita nel componente.
- `SettingsPanel`: rimosso lo slider, aggiunto messaggio informativo.
- Bump versione 0.5.5 → 0.5.6.

---

## [0.5.5] — 2026-05-17

### Fixed
- **StreamLog ora visibile.** La barra log a piè di pagina (introdotta in v0.5.3) era praticamente invisibile per via di tre problemi cumulativi: sfondo a bassa opacità (`bg-stone-900/90`) molto vicino al colore del parent (`bg-stone-950`), padding ridotto, e nessun evento iniziale → la barra restava vuota all'avvio. Fix: contrasto aumentato (`bg-stone-900` opaco, bordo top più marcato `border-t-2 border-stone-700`), padding `py-2`, `shrink-0` esplicito sul wrapper per impedire al flex column di comprimerla, `z-10` per garantire stacking corretto.
- **Evento di sistema iniziale.** All'avvio dell'app (`webContents.did-finish-load`) viene emesso un primo `LOG_EVENT` `system / info / "StreamFlow pronto — in attesa di eventi."` così la barra ha sempre contenuto dal primo frame.

### Changed
- Bump versione 0.5.4 → 0.5.5.

---

## [0.5.4] — 2026-05-17

### Removed
- **Feature Cover Art (B2) eliminata.** L'endpoint `POST /api/station/{id}/art` su cui era basata non esiste in AzuraCast (ritornava 405 dall'inizio). Gli endpoint reali (`/files/{mediaId}/art` per singoli file, `/streamer/{id}/art` per profilo DJ) coprono casi d'uso diversi da uno stream live. AzuraCast gestisce già lato server l'art del DJ in onda (immagine profilo streamer) + fallback automatico MusicBrainz/Last.fm dai metadata Icecast inviati da StreamFlow. Replicare la feature dall'app duplicherebbe l'admin UI senza valore aggiunto.
- File eliminati: `CoverArtPanel.tsx`, funzione `uploadStationArt` da `azuracast-api.ts`, handler IPC `azuracast-upload-art`, espose `azuraCastUploadArt`, dichiarazione tipo relativa.
- Rimosso bottone "Cover Art" dalla toolbar + modale associato in `App.tsx`.

### Changed
- Bump versione 0.5.3 → 0.5.4.

---

## [0.5.3] — 2026-05-17

### Fixed
- **Metadata via raw socket (BUTT-compat) — ✅ CONFERMATO FUNZIONANTE**: la `MetadataManager` è stata riscritta da zero usando `net.Socket` invece di `http.request`. Il modulo `http` di Node forza HTTP/1.1 e aggiunge header (Connection, ecc.) che Liquidsoap harbor parsava male, ritornando body strani che facevano fallire silenziosamente l'invio. La nuova implementazione replica byte-per-byte la richiesta di BUTT (riferimento: `src/icecast.cpp` in [romansavrulin/butt](https://github.com/romansavrulin/butt)): HTTP/1.0, solo gli header essenziali (User-Agent, Authorization, Host), mount NON url-encoded, song encoded solo per `' '` e `'&'`. Liquidsoap risponde `HTTP/1.0 200 OK\r\n\r\nUpdated metadatas for mount /` e il titolo brano appare correttamente sul sito Runtime Radio.

### Added
- **Log a video (stile BUTT)**: nuovo componente `StreamLog` fissato in basso, sempre visibile. Mostra l'ultimo evento nella barra compatta, click su "Log" per espandere e vedere gli ultimi 50 eventi con timestamp, badge sorgente (stream/metadata/system) e codifica colore (info/success/error). Bottone "Clear" per pulire. Eventi inviati via nuovo canale IPC `LOG_EVENT` dal main process: `StreamManager` logga connect/disconnect/errori, `MetadataManager` logga richiesta + risposta di ogni invio.
- **Dettagli risposta server nel Now Playing**: nuovo bottone "Dettagli risposta server" che apre un riquadro con la requestLine inviata e il rawResponse del server, per debug immediato senza dover guardare i log.

### Changed
- `update-metadata` IPC handler ora restituisce anche `httpStatus`, `requestLine`, `rawResponse` oltre a `ok`/`error` per supportare il pannello debug.
- Bump versione 0.5.2 → 0.5.3.

---

## [0.5.2] — 2026-05-17

### Changed
- **Now Playing: rimosso il campo "Show"**. Il protocollo Icecast `updinfo` invia un singolo campo `song` formato come `Artist - Title`, quindi una terza voce era confondente e non veniva mai trasmessa. Ora i metadata sono solo Artist + Title, in linea con tutti i client Icecast standard.

### Added
- **Input Volume slider (Fase D1)**: nuovo controllo nella Configurazione, range 0–200% con default 100%. Inserisce il filtro FFmpeg `-af volume=N` nella pipeline solo se diverso da 100% (zero overhead al default). La modifica si applica al prossimo avvio dello stream.

### Fixed
- **Now Playing fake-OK**: il toast "✓ Inviato" appariva anche quando il server non aveva effettivamente accettato i metadati. La precedente validazione si limitava a `statusCode < 400`, accettando qualsiasi risposta. Ora `MetadataManager.send`:
  - Rifiuta esplicitamente HTTP >= 400 mostrando il body del server.
  - Riconosce risposte HTML (es. harbor Liquidsoap senza supporto `/admin/metadata`) e segnala "Server non Icecast — i metadati non verranno applicati".
  - Parsea XML Icecast e rifiuta su `<return>0</return>` mostrando il `<message>` del server.
  - Logga su console main process la richiesta completa + status + body (primi 200 char) per debug.
- Encoding del mount nei metadata: `/` non viene più url-encodato come `%2F` (alcuni harbor sono sensibili al match esatto).
- Il toast errore in Now Playing mostra ora il messaggio reale del server invece del generico "server raggiungibile?".

---

## [0.5.1] — 2026-05-17

### Fixed
- **AzuraCast/Liquidsoap harbor (bug bloccante)**: lo streaming verso AzuraCast falliva sistematicamente con `-10053 WSAECONNABORTED` perché il Wizard configurava porta Icecast (8000) e mount listener (es. `/radio.mp3`), mentre il DJ deve connettersi all'**input harbor di Liquidsoap** (porta separata, default 8005, mount default `/`). Tre fix combinati:
  - `azuracast-api.ts`: `fetchStationDetail` ora interroga `GET /api/admin/station/{id}` per leggere `backend_config.dj_port` e `backend_config.dj_mount_point` (richiede API Key con permesso "Manage Station Broadcasting"). Se la chiamata admin fallisce (401/403), usa i default AzuraCast (8005 / `/`) e marca `harborInferred: true`.
  - `AzuraCastWizard.tsx`: prima di "Applica" l'utente vede sempre porta e mount in campi editabili (pre-compilati con i valori letti o di default). Banner verde quando i valori sono letti dall'API admin, banner giallo con istruzioni quando sono default. INFO_TEXT aggiornato per richiedere il permesso giusto.
  - `ffmpeg-manager.ts`: riconosce il pattern "auth OK + RST immediato senza streaming" (sintomo classico di mount/porta errati) e mostra un messaggio di errore esplicito che guida l'utente a verificare la configurazione harbor. Aggiunto log diagnostico host/port/mount all'avvio del processo.

---

## [0.5.0] — 2026-05-17

### Added
- **Profili server (B1)**: Il pannello Settings include ora una sezione "Server Profiles" che permette di salvare la configurazione corrente (host, port, mount, icecastUser, bitrate) con un nome personalizzato, caricarla in un click e cancellarla. I profili sono persistiti nel localStorage tramite Zustand. La password non viene mai salvata nel profilo per motivi di sicurezza.
- **Cover Art upload (B2)**: Nuovo pannello "Cover Art" nel'area principale (collassabile). Supporta drag&drop o selezione file (JPG, PNG, GIF, WebP). L'immagine viene ridimensionata lato client via Canvas API (max 1000×1000px, JPEG 92%) prima dell'upload. L'upload avviene via `POST /api/station/{id}/art` con multipart/form-data verso AzuraCast. Il pannello mostra preview, feedback di successo/errore e avvisa se il contesto AzuraCast non è ancora configurato. Il contesto AzuraCast (URL, API Key, stationId) viene salvato nello store al momento dell'applicazione della configurazione dal Wizard.

---

## [0.4.0] — 2026-05-17

### Added
- **Now Playing / Metadata (universale)**: Invio metadati al server via protocollo Icecast `updinfo` (HTTP GET `/admin/metadata?mode=updinfo`). Compatibile con qualsiasi server Icecast-based (AzuraCast, CentovaCast, Shoutcast, Icecast puro). Campi: Show Name (identità trasmissione, persistito), Artist + Title (aggiornabili durante la diretta). Pulsante "Invia" con feedback ✓/✗ e submit su tasto Invio. Auto-invio metadati al momento della connessione confermata.
- **AzuraCast Auto-Config**: Wizard guidato a step — inserimento URL + API Key → caricamento stazioni → selezione stazione → caricamento DJ/streamer → selezione account → "Applica". Popola automaticamente host, port, mount, icecastUser. La password rimane sempre manuale per sicurezza. Il pulsante ⓘ mostra istruzioni inline per ottenere le credenziali API da AzuraCast. Supporto multi-stazione e multi-streamer.

---

## [0.3.2] — 2026-05-17

### Added
- **Bitrate configurabile (M2)**: Il bitrate MP3 non è più hardcoded a 128kbps. Aggiunto campo `bitrate` a `StreamConfig` e select UI in `SettingsPanel` con valori 64/96/128/192/256/320 kbps. Il valore è persistito nel localStorage.

### Fixed
- **console.log in produzione (M4)**: Rimossi tutti i `console.log` non essenziali da `App.tsx` e `ffmpeg-manager.ts`. Mantenuti i soli `console.error` per errori fatali.
- **VuMeter prop `active` ignorata (M1)**: La prop `active: boolean` era dichiarata ma non usata nel body di `VuMeter.tsx`. Ora controlla l'intensità visiva del componente (border, opacità, colore label) in base allo stato ON AIR. Il meter continua a leggere l'input anche a stream fermo (mic check intenzionale).
- **Nessuna validazione input pre-FFmpeg (M3)**: `toggleStream()` in `App.tsx` ora valida `host`, `port` (1–65535) e `password` prima di invocare `startStream()`. Errori mostrati tramite toast esistente.

---

## [0.3.1] — 2026-05-17

### Fixed
- **Timer setInterval ricreato ogni 500ms (V1)**: `seconds` era nelle dipendenze dell'`useEffect` in `Timer.tsx`. Poiché `seconds` cambia ogni 500ms, l'effect veniva smontato e rimontato continuamente, ricreando il `setInterval` in loop. Rimosso `seconds` dalle deps; la logica di reset usa direttamente `setSeconds(0)` e `startTimeRef.current = null` senza guard condizionale (chiamare `setSeconds(0)` quando il valore è già 0 è un no-op in React).
- **Tipi `any` non sicuri (V2)**: Sostituito `config: any` in `preload/index.ts` con una `StreamConfig` interface tipizzata; sostituito `_event: any` con `_event: IpcRendererEvent` da Electron. Il tipo `targetDeviceId: any` in `useAudioVisualizer.ts` era già stato corretto nella v0.3.0 (`{ exact: string } | undefined`).
- **Password in chiaro nel localStorage (V3)**: La funzione `partialize` di Zustand in `useStore.ts` persisteva l'intero oggetto `streamConfig`, inclusa la password. Riscritta per escludere `password` dalla serializzazione: il campo viene persisto come stringa vuota e l'utente deve re-inserirla ad ogni sessione.
- **Doppia registrazione handler IPC su macOS activate (V4)**: `initializeIpc()` veniva chiamata di nuovo nell'evento `app.on('activate')` anche quando era già stata invocata all'avvio. Su macOS questo registra `ipcMain.handle()` duplicate, causando warning Electron e comportamento indefinito. Introdotta flag `ipcInitialized` in `main.ts`.

---

## [0.3.0] — 2026-05-17

### Fixed
- **Timeout connessione non cancellato (G1)**: Il `setTimeout` a 5s in `ffmpeg-manager.ts` non veniva mai cancellato. Se FFmpeg confermava la connessione prima dei 5s, il renderer riceveva un secondo evento `connected` spurio. Se FFmpeg crashava, riceveva `error` e poi `connected` allo scadere del timeout — ribaltando lo stato corretto. Introdotto `connectionTimeoutId` che viene cancellato al primo evento determinante (connessione, errore o chiusura processo).
- **Race condition AudioContext su cambio dispositivo (G2)**: `initAudio()` in `useAudioVisualizer.ts` è async con più `await`. Cambiando dispositivo rapidamente, due esecuzioni si sovrapponevano, lasciando `AudioContext` e microfono in stato locked. Introdotto flag `cancelled` controllato dopo ogni `await`; il cleanup ora azzerae le risorse acquisite parzialmente e resetta il VU meter a zero.
- **Doppio click GO ON AIR avvia e subito uccide FFmpeg (G3)**: Il pulsante non era disabilitato durante `connecting`. Un secondo click chiamava `start()` che internamente esegue `stop()` preventivo, uccidendo il processo appena avviato. `OnAirButton` ora accetta prop `disabled` e mostra stato visivo `WAIT` quando `streamStatus === 'connecting'`.

---

## [0.2.4-rc] — 2026-03-05

### Fixed
- **Diagnostica FFmpeg migliorata**: Il buffer stderr in `ffmpeg-manager.ts` è stato esteso da 500 a 2000 caratteri. Al crash (exit code != 0), vengono estratte e inviate via IPC le ultime 3 righe dello stderr invece dell'ultima sola. Il toast di errore mostra ora la causa reale (es. `Device Occupied`, `401 Unauthorized`) invece della generica stringa finale `Conversion failed`.

---

## [0.2.3-rc] — 2026-03-05

### Fixed
- **Visualizer Crash (OverconstrainedError)**: `useAudioVisualizer.ts` ora genera un hash `deviceId` compatibile con `getUserMedia` di Chromium tramite text-match sul nome DirectShow, eliminando il fallimento della promise al cambio dispositivo.
- **FFmpeg Error Bubbling**: Le eccezioni stderr di FFmpeg (es. exit code 4294957242) vengono ora catturate riga per riga e inviate via IPC per diagnostica trasparente in UI.

---

## [0.2.2-rc] — 2026-03-05

### Fixed
- **Device List vuota (hotfix M3.2)**: Rimossa la constraint `inAudioSection = true` nel parser di `ffmpeg-manager.ts`. Alcune versioni di FFmpeg MSYS2 su macchine senza webcam non stampano l'header testuale atteso. Il parser ora estrae universalmente qualsiasi riga marcata con `(audio)`.

---

## [0.2.1-rc] — 2026-03-05

### Fixed
- **Device List vuota in produzione (hotfix M3)**: L'estrazione IPC dei dispositivi DirectShow falliva o produceva liste vuote/troncate a causa della ricezione chunked dello stderr Node.js. L'output è ora unificato in un singolo buffer analizzato atomicamente all'evento `close` del processo FFmpeg.

---

## [0.2.0-rc] — 2026-03-05

### Changed
- Sostituzione `require` con `import` idiomatico in `preload/index.ts`.
- Eliminato file defunto `src/main/audio.ts`.
- Rimossi commenti morti e ipotetici da `Timer.tsx`.
- Build finale compilata come Release Candidate.

---

## [0.1.9] — 2026-03-05

### Fixed
- **Timer Stuttering**: Il motore cronografico in `Timer.tsx` ora calcola il tempo reale assoluto tramite delta da `Date.now()` invece di incrementi `setInterval`. Il timer è preciso al millisecondo e non accumula ritardo.

---

## [0.1.8] — 2026-03-05

### Fixed
- **DirectShow Device Mapping**: `useAudioDevices.ts` delega l'enumerazione dispositivi al main process via IPC (`get-audio-devices`), che usa FFmpeg per listare i device DirectShow reali. Risolti crash causati da nomi dispositivo non corrispondenti tra React e FFmpeg.

---

## [0.1.7] — 2026-03-05

### Fixed
- **Conflitto CSS**: Rimosso `App.css` che interferiva con Tailwind CSS.
- **Scorie ShadCN**: Eliminate variabili CSS `--background` e simili da `index.css`, residui di un precedente tentativo di integrazione ShadCN/UI non portato a termine.
- **Dipendenze inutilizzate**: Rimosse `lucide-react`, `tailwind-merge`, `clsx` e altre 2 dipendenze non usate da `package.json`. Pulizia `tailwind.config.cjs`.

---

## [0.1.6] — 2026-03-05

### Fixed
- **Alert bloccante**: Sostituiti tutti gli `alert()` in `App.tsx` con un sistema di notifiche Toast non bloccante gestito via Zustand (`errorMessage`).
- **Timeout connessione fittizio**: Rimosso il timeout cieco a 2s per rilevare lo stato online. Lo stato passa a `connected` solo quando FFmpeg conferma fisicamente l'invio di dati (eventi `size` e `time` su stderr).

---

## [0.1.5] — 2026-03-05

### Added
- `env.d.ts` con type declarations per `window.electronAPI` — contratto formale IPC tipizzato.

### Fixed
- Rimossi 5 `@ts-ignore` da `App.tsx`. Tutte le chiamate IPC sono ora type-safe con autocompletamento IDE.

---

## [0.1.4] — 2026-03-05

### Fixed
- **Processi FFmpeg orfani**: Aggiunto handler `before-quit` che termina FFmpeg prima della chiusura dell'app.
- **Processo Electron zombie**: Aggiunto handler `window-all-closed` per chiusura corretta su Windows/Linux.
- Nuova funzione `cleanupIpc()` in `ipc.ts` per shutdown sicuro dello StreamManager.

---

## [0.1.3] — 2026-03-05

### Fixed
- **Memory Leak critico**: L'IPC listener per `STREAM_STATUS` si accumulava a ogni re-mount React senza cleanup. Il preload bridge ora restituisce una funzione di unsubscribe. `useEffect` in `App.tsx` invoca il cleanup al dismount.

---

## [0.1.2] — 2026-03-05

### Fixed
- **FFmpeg inaccessibile in produzione**: Il binario FFmpeg restava dentro l'archivio `.asar` e non era eseguibile. Aggiunta configurazione `asarUnpack` in `electron-builder.json`. Risoluzione path automatica `app.asar` → `app.asar.unpacked` in `ffmpeg-manager.ts`.

---

## [0.1.1] — 2026-03-05

### Fixed
- **Codice stale in development**: Lo script `electron:dev` non ricompilava il Main Process. Electron eseguiva codice compilato in precedenza. Aggiunta compilazione forzata a ogni avvio.
- Rimossi handler IPC duplicati in `audio.ts`.
- Rimosso campo `bitrate` inutilizzato da `StreamConfig`.

### Changed
- Status bar in SettingsPanel ora dinamica (legge `streamStatus` dallo store Zustand).
- Pulizia commenti di debug (~50 righe) da `App.tsx` e `VuMeter.tsx`.
- Versione UI sincronizzata con package.json.

---

## [0.1.0] — 2026-02-08

### Added
- Header `User-Agent: FMLE/3.0` per emulare encoder standard industriali.
- Header `Ice-Public: 1`.

### Fixed
- **Connection Reset**: Rimosso l'header `Expect: 100-continue` che causava disconnessione immediata con server AzuraCast/Icecast moderni.
- Integrazione cumulative dei fix v0.0.9 (taskkill, chunked post disabilitato).

---

## [0.0.9] — 2026-02-08

### Changed
- Disabilitato chunked encoding (`-chunked_post 0`) per compatibilità Icecast/AzuraCast.
- Gestione processi Windows con `taskkill` per eliminare processi FFmpeg orfani.
- Normalizzazione mount point (forzata `/` se vuoto).

---

## [0.0.8] — 2026-02-07

### Added
- Supporto protocollo BUTT via HTTP PUT.
- Forzatura slash finale per mount point root.

---

## [0.0.7] — 2026-02-07

### Changed
- Migrazione da protocollo `icecast://` a `http://` con metodo PUT.
- Aggiunto `-method PUT` e `-content_type audio/mpeg` ai parametri FFmpeg.

---

## [0.0.6] — 2026-02-07

### Fixed
- Confermata esclusione di `isStreaming` dal localStorage (stato volatile non persistito).

---

## [0.0.5] — 2026-02-07

### Changed
- Refactor persistenza stato: `partialize` esclude stati volatili da localStorage.
- Centralizzazione `isStreaming` e `streamStatus` nello store Zustand.

---

## [0.0.4] — 2026-02-07

### Fixed
- Pulizia regex nomi dispositivi audio su Windows (rimozione prefissi "Default -" e suffissi ID hardware).
- Encoding sicuro delle credenziali Icecast nell'URL.

---

## [0.0.3] — 2026-02-07

### Added
- Core streaming backend con `ffmpeg-static`.
- `StreamManager` per gestione processi child FFmpeg.
- Supporto input DirectShow su Windows.
- IPC handlers `start-stream` e `stop-stream`.
- Comunicazione bidirezionale stato via evento `STREAM_STATUS`.

### Fixed
- Patch 0.0.3b: Aggiunto supporto campo "Icecast User" (DJ Mode). Risolti problemi Hot Reload in dev mode.

---

## [0.0.2] — 2026-02-07

### Added
- Gestione input audio reale via Web Audio API.
- VU Meter dinamici.
- Selezione dispositivo audio input con persistenza.

---

## [0.0.1] — 2026-02-06

### Added
- Inizializzazione progetto: Vite + React + TypeScript + Electron.
- UI base: Timer, VU Meter simulati, OnAirButton, SettingsPanel.
- Integrazione Tailwind CSS.

### Fixed
- Patch 0.0.1b: Downgrade `electron-builder` a v24.13.3 (versione stabile).
- Patch 0.0.1c: Risolto `ReferenceError: exports` rimuovendo `"type": "module"` da `package.json`.

---

> Per i dettagli tecnici completi di ogni sessione, consulta i [log individuali](./log/).
