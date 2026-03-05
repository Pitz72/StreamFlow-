# Changelog StreamFlow

Tutte le modifiche degne di nota a questo progetto saranno documentate in questo file. Il formato è basato su [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.4-rc] - 2026-03-05

### Fixed
- **FFmpeg Error the Bubble The M3.5**: Aggiunta logica the The the the di retrospettiva the IPC a the the the 3 The righe The the the per the `ffmpeg-manager.ts`. L'UI adesso The the mostra l'errore the The testuale *reale* The the d'arresto the The the `stderr` Icecast/DSHOW, non the the The fermandosi The The alla dicitura The The generica di system the the the The The kill `Conversion the the failed`, the the The per favorire The the lo step The finale the The Di the the The The the The the the the troubleshooting the the.

## [0.2.3-rc] - 2026-03-05

### Fixed
- **Visualizer Crash (OverconstrainedError)**: Il modulo `useAudioVisualizer.ts` è the stato The the the addestrato a text-matchare la stringa nativa DSHOW The per The generare un The the un the hash The `deviceId` fully compatibile The the con The Chromium `getUserMedia`, impedendo The il the The The fallimento della The promise.
- **FFmpeg Error Bubbling**: Le eccezioni The the non-GUI di the FFmpeg `stderr` (es: `Exit code 4294957242`) vengono ora catturate The stringa The per the the The stringa e inviate the The The via the the the IPC the the per un troubleshooting trasparente the in console/UI The

## [0.2.2-rc] - 2026-03-05

### Fixed
- **Device List Assente parte 2 (M3.2-Hotfix)**: Eliminata la constraint di validazione `inAudioSection = true` nel parser `ffmpeg-manager.ts`. Alcune the versioni di FFmpeg the MSYS2 the non the stampano l'header testuale the The su macchine the the senza the the the webcam. Ora The estrae universally qualsiasi the The the riga the the marcata the con `(audio)`. L'EXE estrae ora tutti i The the the The The the device audio correttamente

## [0.2.1-rc] - 2026-03-05

### Fixed
- **Device List Vuota in Prod (M3-Hotfix)**: L'estrazione IPC dei dispositivi DirectShow (Audio) falliva o generava liste vuote/troncate in the production a causa the the della ricezione chunked dello `stderr` di Node. L'output è stato unificato The the The the in un singolo `outputBuffer` analizzato atomitcamente a the fine the the esecuzione FFmpeg (`close`).

## [0.2.0-rc] - 2026-03-05

### Fixed
- **Cosmesi e Pulizia (L1, L2, C1)**: Rimozione dell'obsoleto `require` in `preload/index.ts` sostituito da un idiomatico `import`. Eliminato script defunto `src/main/audio.ts`. Epurazione commenti morti o ipotetici persistenti nel file `Timer.tsx` in modo da avere logica "self-documenting". Compilata build finale the come RC pronta the alla consegna the the the.

## [0.1.9] - 2026-03-05

### Fixed
- **Timer Stuttering (M4)**: Ottimizzato il motore cronografico nel componente `Timer.tsx`. L'incremento non è più basato ciecamente sull'Event Loop che accumulava ritardo (`setInterval` +1), bensì calcola il tempo reale assoluto interpolato sul delta temporale dall'inizio connessione via `Date.now()`. Timer ora reattivo e scorrevole al millisecondo.

## [0.1.8] - 2026-03-05

### Fixed
- **DirectShow Device Mapping (M3)**: Sostituito l'uso inaffidabile di `navigator.mediaDevices` per recuperare i nomi dei microfoni. Ora `useAudioDevices.ts` delega a Node via IPC (`get-audio-devices`), forzando `ffmpeg.exe` a listare autonomamente i propri input sicuri `dshow`. Questo risolve i crash legati all'errata stringa "inputDeviceName".

## [0.1.7] - 2026-03-05

### Fixed
- **Pulizia CSS Default (M1)**: Eliminato del tutto `App.css` che confliggeva sottilmente con Tailwind.
- **Rimozione scorie Componenti UI (M2)**: Cancellato tutto il set esteso di decine di CSS Var (`--background`, etc.) su `:root` in `index.css` derivanti da prove Shadcn.  
- **Rimozione Dipendenze Fantasma**: Rimosse e disinstallate da `package.json` 5 dipendenze (`lucide-react`, `tailwind-merge`, `clsx`, ecc.) che non erano usate, alleggerendo il tree. Epurato config `tailwind.config.cjs`.

## [0.1.6] - 2026-03-05

### Fixed
- **Alert Bloccante (V3)**: Sostituiti tutti gli `alert()` in `App.tsx` con un sistema di notifiche Toast non bloccante via Zustand (`errorMessage`).
- **Timeout Connessione (V4)**: Rimosso il falso timeout cieco a 2s per rilevare l'online in `ffmpeg-manager.ts`. Lo stato passa a ON AIR solo quando FFmpeg conferma fisicamente il loop inviando eventi di "size" e "time".

## [0.1.5] - 2026-03-05

### Added
- **[NEW]** `env.d.ts` con type declarations per `window.electronAPI` — contratto formale IPC tipizzato.

### Fixed
- Rimossi 5 `@ts-ignore` da `App.tsx` — tutte le chiamate IPC ora type-safe con autocompletamento IDE.

## [0.1.4] - 2026-03-05

### Fixed
- **Processi FFmpeg orfani**: Aggiunto `before-quit` per terminare FFmpeg prima della chiusura dell'app.
- **Processo Electron zombie**: Aggiunto `window-all-closed` per chiudere correttamente l'app su Windows/Linux.
- Nuova funzione `cleanupIpc()` in `ipcp.ts` per shutdown sicuro dello StreamManager.

## [0.1.3] - 2026-03-05

### Fixed
- **Memory Leak Critico**: L'IPC listener per `STREAM_STATUS` si accumulava ad ogni re-mount React senza cleanup.
- Preload bridge ora restituisce una funzione di unsubscribe dal listener.
- `useEffect` in `App.tsx` ora invoca il cleanup al dismount del componente.

## [0.1.2] - 2026-03-05

### Fixed
- **Bug Critico**: FFmpeg inaccessibile nelle build di produzione — binario impacchettato dentro l'archivio asar.
- Aggiunta configurazione `asarUnpack` per estrarre `ffmpeg-static` dall'archivio.
- Risoluzione path automatica `app.asar` → `app.asar.unpacked` in `ffmpeg-manager.ts`.

## [0.1.1] - 2026-03-05

### Fixed
- **Bug Critico**: Lo script `electron:dev` non compilava il Main Process — Electron eseguiva codice stale.
- Versione UI sincronizzata (era `v0.0.8`, ora `v0.1.1`).
- Rimossi handler IPC duplicati in `audio.ts`.
- Rimosso campo `bitrate` inutilizzato da `StreamConfig`.

### Changed
- Status bar in SettingsPanel ora dinamica (legge `streamStatus` dallo store Zustand).
- Pulizia commenti di debug (~50 righe) da `App.tsx` e `VuMeter.tsx`.
- Documentazione `ARCHITECTURE.md` corretta su encoding e VU Meter.

## [0.1.0] - 2026-02-08

### Added
- Impostato `User-Agent: FMLE/3.0` per emulare encoder standard industriali.
- Header aggiuntivo `Ice-Public: 1`.

### Fixed
- **Bug Critico**: Risolta la disconnessione immediata ("Connection Reset") rimuovendo l'header `Expect: 100-continue`.
- Integrazione completa dei fix v0.0.9 (Taskkill, Chunked Post disabled).

## [0.0.9] - 2026-02-08

### Changed
- Disabilitato Chunked Encoding (`-chunked_post 0`) per compatibilità con server Icecast/AzuraCast.
- Gestione processi Windows migliorata con `taskkill` per evitare processi FFmpeg orfani.
- Normalizzazione Mount Point (forzata a `/` se vuoto).

## [0.0.8] - 2026-02-07

### Added
- Supporto nativo protocollo **BUTT** via HTTP PUT.
- Forzatura slash finale per mount point di root.

## [0.0.7] - 2026-02-07

### Changed
- Migrazione radicale da protocollo `icecast://` a `http://` con metodo `PUT`.
- Aggiunto `-method PUT` e `-content_type audio/mpeg` ai parametri FFmpeg.

## [0.0.6] - 2026-02-07

### Fixed
- Validazione persistenza stato: confermata esclusione di `isStreaming` dal localStorage.

## [0.0.5] - 2026-02-07

### Changed
- Refactor persistenza stato globale: utilizzati `partialize` per escludere stati volatili.
- Centralizzazione `isStreaming` e `streamStatus` nello store Zustand.

## [0.0.4] - 2026-02-07

### Fixed
- Implementata pulizia regex dei nomi dispositivi audio su Windows (rimozione prefissi "Default -" e suffissi ID HW).
- Encoding sicuro delle credenziali Icecast nell'URL.

## [0.0.3] - 2026-02-07

### Added
- Core Streaming Backend integrato con `ffmpeg-static`.
- Implementato `StreamManager` per la gestione dei processi child.

### Fixed
- Patch 0.0.3b: Aggiunto supporto "Icecast User" (DJ Mode) e risolti problemi di Hot Reload in Dev Mode.

## [0.0.2] - 2026-02-07

### Added
- Gestione input audio reale tramite Web Audio API.
- VU Meter dinamici e selezione dispositivo input persistente.

## [0.0.1] - 2026-02-06

### Added
- Inizializzazione progetto Vite + React + TypeScript + Electron.
- UI Base: Timer, Vu Meter (simulati), OnAirButton, SettingsPanel.
- Integrazione Tailwind CSS e ShadCN/UI.

### Fixed
- Patch 0.0.1b: Ripristino ambiente e downgrade `electron-builder` a v24.13.3 (stabile).
- Patch 0.0.1c: Risoluzione bug `ReferenceError: exports` rimuovendo `"type": "module"`.

---

> Per i dettagli tecnici completi di ogni sessione, consulta i [log individuali](./log/).
