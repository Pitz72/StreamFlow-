# Changelog StreamFlow

Tutte le modifiche degne di nota sono documentate in questo file.
Formato basato su [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
