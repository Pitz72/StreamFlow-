# Changelog StreamFlow

Tutte le modifiche degne di nota sono documentate in questo file.
Formato basato su [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.8.1] — 2026-07-28

Il sottofondo musicale si alzava e si abbassava da solo in onda. Dettagli e misure in [log/0.8.1.md](./log/0.8.1.md).

### Fixed
- **Il volume della musica ondeggiava da solo (MIX MODE).** L'audio di sistema veniva catturato con `getDisplayMedia({ audio: true })`, cioè senza vincoli espliciti: Chromium ci applicava allora il suo trattamento da videochiamata, **controllo automatico del guadagno compreso**. L'AGC inseguiva un livello di riferimento e gonfiava il sottofondo fino a coprire la voce. Ora i tre processori sono spenti sulla cattura di sistema come già lo erano sul microfono.
  - Spiega anche perché abbassare il cursore *Volume musica* non risolveva: l'AGC agisce dentro la traccia, quindi **prima** del cursore, che si limitava a moltiplicare un segnale già gonfiato.
  - Misurato su una registrazione reale di 17'30'': 120 variazioni ≥ 6 dB del sottofondo, non correlate al parlato. Nessun ducking (1,4 dB di differenza tra voce presente e voce assente).

### Added
- **Riga di diagnostica all'avvio della MIX MODE**: il log riporta le impostazioni effettive della traccia di sistema (`AGC spento, eco spento, rumore spento, 48000 Hz, 2 canali`). Un vincolo su `getDisplayMedia` può essere ignorato in silenzio a seconda di Chromium e del driver di loopback; se l'AGC risulta ancora acceso, il log lo dichiara in rosso.

---

## [0.8.0] — 2026-07-26 · *Deborah Edition*

Il mixer per chi non ha un mixer. Dettagli tecnici in [log/0.8.0.md](./log/0.8.0.md).

### Added
- **MIX MODE.** StreamFlow somma il **microfono** e l'**audio di sistema** (la musica di Runtime Live Machine Pro) e manda in onda il risultato. Nessun driver, nessuna scheda audio virtuale, nessun *Missaggio Stereo*: la cattura in loopback la fa Electron. Si attiva in Configurazione **prima** della diretta — cambia la sorgente dell'encoder, quindi il pannello la blocca mentre si è in onda.
  - Il mix avviene nel renderer con Web Audio e arriva a FFmpeg come PCM su `stdin` (`-f s16le -ar 48000 -ac 2 -i pipe:0`). Due input dshow con `amix` non erano praticabili: su Windows non esiste un device che catturi l'uscita audio, e due device separati hanno clock indipendenti che vanno in deriva sulle sessioni lunghe.
  - Il PCM esce da un `AudioWorkletProcessor`, quindi dal thread audio: il mixer non si ferma se l'interfaccia è occupata o la finestra passa in secondo piano.
  - Il mix non viene **mai** riprodotto (unico collegamento all'uscita tramite un gain a zero): altrimenti il loopback lo ricatturerebbe all'infinito.
- **Volume musica** separato in Configurazione, regolabile anche in diretta. Il volume della voce resta *Input Volume* nella schermata principale.
- **Spia MIX nell'intestazione.** Diventa rossa quando dal computer non arriva audio da più di 4 secondi. Intercetta il guasto silenzioso di questa modalità: il player impostato su un'uscita diversa da quella predefinita di Windows, con la musica che si sente in cuffia e il silenzio in onda.
- **VU meter post-mix**: in MIX MODE le lancette mostrano quello che va davvero in onda, non il solo microfono.

### Changed
- I tre processori audio di Chrome (cancellazione d'eco, riduzione rumore, **controllo automatico del guadagno**) vengono disattivati sul microfono in MIX MODE: sono pensati per le videochiamate, e l'AGC in particolare pomperebbe il respiro nei silenzi schiacciando la voce sui picchi.
- CSP: aggiunto `blob:` a `script-src`, necessario al modulo dell'AudioWorklet (un `.js` su disco non è caricabile come modulo da `file://` in produzione).

### Note d'uso
- **Cuffie obbligatorie**: con le casse il microfono ripiglia la musica.
- Va in onda **tutto** l'audio del computer, notifiche di Windows comprese.
- **Limite noto**: gli eventi della MIX MODE compaiono nel pannello Log ma non nel file di log (il mixer vive nel renderer).

---

## [0.7.3] — 2026-07-25

### La scoperta

L'errore `-10054` (`WSAECONNRESET`) che faceva cadere la diretta dopo ~1 secondo è stato **riprodotto in laboratorio usando una password volutamente errata**. Byte per byte lo stesso esito:

```
Error muxing a packet
Error writing trailer: Error number -10054 occurred
Conversion failed!          →  a time=00:00:00.65
```

Il motivo: con `-chunked_post 0` FFmpeg **non legge mai la risposta HTTP**. Manda gli header, comincia a scrivere il corpo e continua finché il socket non gli muore sotto. Il server risponde regolarmente `401 Unauthorized` e chiude, ma quella risposta non arriva mai all'utente: quello che si vede è un errore di socket che sembra un guasto di rete.

Verificato con un client HTTP che la risposta la legge:

| Credenziali | Risposta dell'harbor |
|---|---|
| utente sconosciuto | connessione azzerata, nessuna risposta |
| utente esistente, password errata | `401 Unauthorized` |

Nota metodologica: la prima versione della sonda **non riproduceva il guasto**, perché senza `-re` FFmpeg spinge `anullsrc` a ~50x e i secondi di prova finiscono nel buffer del socket in un istante. Con `-re` il fallimento compare a 0,65s.

### Added
- **Test connessione** (Configurazione → Diagnostica). Sequenza attiva su quattro strati, con esito riga per riga nel pannello Log e nel file:
  1. **DNS** — elenca gli indirizzi IPv4 e IPv6, segnalando il caso dual-stack in cui un percorso IPv6 difettoso apre la connessione e la fa morire subito dopo.
  2. **TCP** — connessione grezza verso *ciascun* indirizzo separatamente, con i tempi. Distingue "porta bloccata" da "host irraggiungibile".
  3. **Credenziali** — stesso `PUT` della diretta ma con il client HTTP di Node, che **la risposta la legge**: `401` e `403` diventano messaggi espliciti invece di un errore di rete. Se fallisce, la sequenza si ferma qui.
  4. **Trasmissione** — 20 secondi di silenzio generato (`anullsrc -re`), stesso bitrate e stessi header della diretta, con FFmpeg in `-loglevel verbose` così il dialogo HTTP completo finisce nel file di log. Riporta secondi sopravvissuti e kB trasmessi.

  Non serve il microfono. Occupa il canale per una ventina di secondi, quindi il pulsante è disabilitato durante una diretta.

### Changed
- **Diagnosi della caduta immediata.** Quando la diretta cade entro 3 secondi con un RST, il log non parla più genericamente di connessione persa: indica le credenziali come causa quasi certa, spiega perché FFmpeg riporta un errore di rete al posto del 401, e rimanda al Test connessione.

---

## [0.7.2] — 2026-07-25

Versione **diagnostica**, nata da un caso reale: un DJ non riusciva a connettersi e non c'era modo di sapere perché. La causa era visibile solo per 5 secondi in un toast che poi spariva.

### Fixed
- **Errore di connessione invisibile nel log (D1, critico per l'assistenza).** Il ramo `CONNECT_ERROR` di `ffmpeg-manager.ts` era l'unico a chiamare `sendStatus('error')` **senza** una corrispondente `this.log()`. Il pannello Log si fermava quindi su `Connecting → …` e la causa reale (401, Connection refused, 403…) non compariva da nessuna parte in modo persistente. Ora l'errore viene loggato, con una **spiegazione in italiano** accanto al messaggio grezzo di FFmpeg (`explainConnectError`): credenziali rifiutate, mount inesistente, porta bloccata, altro DJ già collegato.
- **Toast di errore autocancellante.** Il messaggio di errore spariva dopo 5 secondi (`App.tsx`), portandosi via l'unica spiegazione disponibile. Ora resta finché non lo si chiude con la ✕.
- **Buffer del log troppo corto.** 50 eventi si esaurivano in pochi secondi durante un ciclo di riconnessioni, cancellando proprio la riga con la causa iniziale del problema. Portato a 400.
- **Stato "connesso" presunto e silenzioso.** Il fallback a 5 s dichiarava `connected` senza che fosse passato un solo byte, senza scrivere nulla nel log: un input dshow che non si apre o un firewall che scarta in silenzio si presentavano come ON AIR regolare. Lo stato resta invariato (per non rompere i server lenti a rispondere) ma ora emette un avviso esplicito nel log.

### Added
- **Log diagnostico su file (D1).** Nuovo modulo `src/main/file-logger.ts`. Ogni evento del pannello viene scritto anche in `Documenti\StreamFlow\logs\streamflow-YYYY-MM-DD.log`, insieme allo **stderr grezzo di FFmpeg** — che è dove sta la diagnosi vera e che finora finiva solo in `console.log`, invisibile senza DevTools. Intestazione con versione app, piattaforma, Electron e Node. Storico di 7 giorni, poi i file vecchi vengono eliminati all'avvio.
  - **Nessuna credenziale nel file**: `redact()` maschera l'header `Authorization: Basic`, i campi `password=` e le credenziali inline negli URL. L'header Basic è decodificabile da chiunque riceva il file, quindi la redazione è un requisito, non una precauzione.
  - Il logger non può far fallire l'app: ogni operazione è in `try/catch` silenzioso. Se `Documenti` non è scrivibile, l'app parte comunque e lo segnala nel pannello Log.
- **Pulsante "Apri cartella log"** in Configurazione → Diagnostica, così un utente non tecnico può allegare il file con due click.
- **Riconoscimento del pattern "kicked".** Quando lo stream è realmente partito e il peer chiude con un RST (`-10054`/`WSAECONNRESET`) entro 30 secondi, il log non riporta più il criptico `Error muxing a packet / Error number -10054` ma spiega che credenziali, porta e mount sono corretti (l'audio stava passando) e che la causa va cercata altrove: account DJ fuori fascia oraria su AzuraCast, doppia connessione sullo stesso account, o antivirus locale che tronca l'upload HTTP continuo. Riporta anche **quanti secondi è durata** la diretta prima del taglio.

---

## [0.7.1] — 2026-07-24

Prima versione pensata per la **consegna interna** ai DJ di Runtime Radio.

### Added
- **Elenco DJ completo** nella tendina: Studio Milano 1 (`AlexGRaccu`), Studio RM 2 (`doomboy`), Studio Runtime Castelli Romani (`PixelDebh_Runtime`), Studio Centrale di Monterotondo (`pizzisimone1972@gmail.com`).
- **C2 — Registrazione locale della diretta.** Nuova opzione in Configurazione: "Salva una copia MP3 della diretta in Documenti\StreamFlow". Implementata con il muxer `tee` di FFmpeg: **un solo encoding**, due destinazioni (server + file), stessa qualità dello stream. Un file per sessione (`RuntimeRadio_YYYY-MM-DD_HH-MM-SS.mp3`); con l'auto-reconnect ogni ripresa apre un file nuovo (split automatico). Un errore sul file (disco pieno, permessi) interrompe solo la registrazione, MAI la diretta (`onfail=ignore`); viceversa un errore di connessione fa uscire FFmpeg come prima (auto-reconnect invariato). Le opzioni HTTP BUTT-compat (PUT, headers, no-chunked) sono passate per-slave perché quelle globali non si propagano dentro il tee — **verificato headless byte-per-byte** contro un server locale.
  - Caso limite gestito: se il server rifiuta la connessione, il tee proseguirebbe registrando "muto" facendo sembrare l'app ON AIR — ora viene riconosciuto (`Slave muxer #0 failed`) e trattato come errore di connessione con stop della sessione.
- **VU meter post-gain**: le lancette ora riflettono il volume input impostato, anche quando lo si regola in diretta. Il moltiplicatore (lo stesso del filtro `volume` di FFmpeg, lineare) è applicato alla sola visualizzazione, letto dallo store via ref a ogni frame — pipeline audio e performance invariate.
- **Nuova icona applicazione**: pulsante REC rosso acceso con "R" (glifo Georgia Bold convertito in path SVG), su piastra petrolio con cornice ottone in stile Deco Dial. Set completo rigenerato (ICO Windows multi-risoluzione, PNG Linux, ICNS).

### Changed
- Archiviato l'handoff grafico del redesign in `docs/archive/design_handoff_deco_dial.zip`.
- Bump versione 0.7.0 → 0.7.1.

---

## [0.7.0] — 2026-07-24

**Cambio di direzione: StreamFlow diventa il client ufficiale INTERNO di Runtime Radio.** La configurazione di connessione validata in diretta (v0.6.0) è ora preimpostata e non modificabile dall'utente: chi trasmette sceglie solo il proprio nome utente dalla tendina e inserisce la password.

### Added
- **Preset di stazione** (`src/renderer/config/stationPreset.ts`): host `player.runtimeradio.com`, porta harbor `8005`, mount `/`, MP3 `192 kbps` — fissi e mostrati in sola lettura nel pannello Configurazione. L'elenco DJ vive nello stesso file: per aggiungere un DJ si aggiorna l'array e si rilascia una nuova build.
- **Tendina "Nome utente (DJ)"** al posto dei campi manuali, con voce "Altro utente…" per un DJ non ancora in elenco (inserimento manuale, nessun rebuild necessario per casi occasionali).
- **"Ricorda la password su questo computer"** (attivo di default): la password è salvata **cifrata** via Electron `safeStorage` (DPAPI, decifrabile solo dall'account Windows dell'utente) in `userData/dj-credentials.json`, una voce per nome utente. Viene salvata solo DOPO una connessione riuscita (mai una password sbagliata), precompilata all'avvio e al cambio utente, ed eliminata deselezionando la casella. Mai in chiaro su disco né nel localStorage.

### Changed
- Pannello Configurazione ridotto all'essenziale: nome utente, password, dispositivo audio. Banner "Runtime Radio — client interno" + riepilogo connessione in sola lettura per diagnostica.
- Migrazione automatica: una config manuale pre-0.7.0 nel localStorage viene sovrascritta dal preset (l'utente selezionato e il volume input vengono conservati).
- Validazione GO: ora richiede anche il nome utente non vuoto.
- Bump versione 0.6.0 → 0.7.0.

### Removed
- **Wizard AzuraCast** (`AzuraCastWizard.tsx`) e API AzuraCast nel main (`azuracast-api.ts`, handler IPC `azuracast-*`): superati dal preset. Recuperabili dalla history git se in futuro servirà sincronizzare l'elenco DJ via API.
- **Profili server** (salva/carica/elimina) dallo store e dal pannello: con la configurazione unica preimpostata non hanno più ragione d'essere.

---

## [0.6.0] — 2026-07-13

### Added
- **Volume input regolabile IN DIRETTA.** Finora lo slider Input Volume si applicava solo al successivo avvio dello stream (FFmpeg non ricarica i filtri a caldo). Ora, mentre sei ON AIR, la regolazione ha effetto immediato sull'audio trasmesso, senza interruzioni e senza riavviare l'encoder. Implementazione: il filtergraph FFmpeg include `azmq,volume=eval=frame`; un client ZMTP (ZeroMQ REQ) scritto in puro Node — **nessuna dipendenza nativa** — invia il comando `volume` runtime al filtro via loopback. Meccanismo validato end-to-end contro il binario ffmpeg-static incluso (comando di mute a metà di un tono → silenzio confermato via silencedetect).
  - Il canale di comando usa la porta ZMQ 5555 (bind default di FFmpeg). Se la porta è occupata, lo stream parte comunque ma senza regolazione live (degradazione morbida, indicata in UI): il valore si applicherà al prossimo avvio.
  - Lo slider fa feedback: "● In diretta" (verde) quando la regolazione è applicata live, oppure avviso ambra se il canale live non è disponibile.
  - Gli invii durante il trascinamento sono limitati (~80ms) per non floodare, con invio finale garantito.
  - Il valore live aggiorna anche la config di sessione, così un'eventuale riconnessione automatica riparte dall'ultimo volume impostato.

### Changed
- `StreamManager.start()` è ora asincrono (attende il check di disponibilità della porta ZMQ prima di comporre il filtergraph); guard di generazione per abortire un `launch()` reso obsoleto da uno start/stop avvenuto durante l'attesa.
- Bump versione 0.5.9 → 0.6.0.

### Nota
- Al primo avvio Windows Defender Firewall potrebbe chiedere un'autorizzazione per FFmpeg (che apre la porta di comando locale). La regolazione live funziona comunque via loopback anche negando la richiesta; la si può ignorare/negare senza conseguenze.

---

## [0.5.9] — 2026-07-13

### Fixed
- **VU meter a scatti (~1 aggiornamento/sec) e apparentemente inerte** — regressione introdotta in v0.5.8 unificando la pipeline stereo. Due cause: (1) il livello aggiornava uno `useState` a 60fps facendo ri-renderizzare l'intera `App` a ogni frame; (2) Electron con `backgroundThrottling` di default rallentava `requestAnimationFrame` a ~1fps quando la finestra era dietro un'altra (tipico durante la diretta, con il browser in primo piano). Fix: l'altezza delle barre L/R è ora scritta **direttamente nel DOM** dal loop rAF via ref (zero re-render React per frame), e `backgroundThrottling: false` sulla finestra mantiene i meter fluidi anche in background. Aggiunto anche `AudioContext.resume()` se il context parte sospeso.

### Changed
- Bump versione 0.5.8 → 0.5.9.

---

## [0.5.8] — 2026-07-13

Hardening completo post-audit: chiuse tutte le criticità **gravi** e **medie** rimanenti e tutte le **lievi** (vedi `docs/AUDIT-2026-07-13.md`).

### Fixed
- **S4** — su macOS la riapertura da dock creava una finestra "morta": `initializeIpc` è ora idempotente (handler registrati una volta, finestra/log sink ricollegati a ogni finestra), `main.ts` la richiama in ogni `createWindow`.
- **S5** — doppio click su GO nel varco pre-`connecting`: guard sincrono `startInFlightRef` nel renderer, rilasciato al primo status IPC (fallback 3s).
- **M1** — i VU meter L/R erano identici (falso stereo) e ognuno apriva la propria pipeline audio completa: ora un'unica pipeline condivisa (`getUserMedia` → `ChannelSplitter` → 2 `AnalyserNode`) con canali reali; input mono duplicato su entrambi.
- **M6** — `taskkill` era fire-and-forget anche in `before-quit` (possibile FFmpeg orfano alla chiusura): `stop(true)` usa `execSync` nel percorso di quit.
- **M7** — le API AzuraCast non seguivano i redirect: 301/302 ora seguiti (max 3 hop) — un URL `http://` che redirige a `https://` non produce più l'errore opaco "HTTP 301".
- **M8** — `handleSend` (Now Playing) e i loader del wizard AzuraCast senza try/catch: una rejection IPC lasciava la UI bloccata su "sending"/"loading". Ora gestita con messaggio d'errore.
- **L3** — enumerazione device: timeout di 10s (FFmpeg bloccato non lascia più la promise pendente) + dedup dei nomi (chiavi React duplicate).
- **L4** — detection errori FFmpeg per substring (`includes('401')`) sostituita da regex con word boundary: "size= 401kB" non può più risultare un errore HTTP.
- **L5** — metadata: se il server risponde ma non chiude la connessione, la risposta viene valutata al timeout invece di riportare un falso "Timeout (5s)".
- **L6** — la config metadata viene impostata solo se lo stream è effettivamente partito (`start()` ritorna boolean).
- **L7** — il timer non si azzera più su disconnect/error: la durata dell'ultima sessione resta visibile; riparte da zero al prossimo GO.
- **L8** — il listener status IPC non viene più ri-sottoscritto a ogni keystroke nei campi metadata (ref sui metadata correnti).
- **L9** — Now Playing: timeout di reset ripuliti allo smontaggio, guard sugli invii concorrenti via Enter.
- **L13** — allo start il device salvato viene verificato contro la lista corrente: messaggio chiaro se scollegato (invece dell'errore dshow criptico).

### Security
- **M4** — CSP di produzione stretta: `script-src 'self'` (rimossi `unsafe-inline`/`unsafe-eval`); in dev un plugin Vite rilassa la direttiva per react-refresh.
- **M5** — `sandbox: true` sul renderer (FFmpeg è spawnato nel main, il commento "For FFmpeg spawning" era errato) + `setWindowOpenHandler` deny + guard `will-navigate`.
- **M9** — single instance lock: una seconda istanza di StreamFlow fa focus sulla prima invece di contendersi device audio e harbor.
- **M3** — sanificazione metadata sul raw socket: control char (CR/LF = header injection) rimossi, `%`/`#`/`?` percent-encoded, mount ripulito da whitespace.
- **S2** — credenziali nella command line FFmpeg: rischio strutturale documentato nel codice (limite di FFmpeg CLI), mitigato con `windowsHide: true` su tutti gli spawn.

### Changed
- **L1** — versione non più hardcoded: header UI da `__APP_VERSION__` (define Vite ← package.json), User-Agent metadata da `app.getVersion()`.
- **L2** — flag FFmpeg deprecato `-ab` → `-b:a`.
- **L10** — `tsconfig.main.tsbuildinfo` rimosso dal tracking git (`*.tsbuildinfo` in .gitignore): era il file perennemente "modificato".
- **L11** — rimosso favicon inesistente `/vite.svg` e asset vuoto `react.svg`; titolo pagina "Runtime StreamFlow".
- **L12** — rimossa lib `DOM` dal tsconfig del main process.
- **L14** — modale Configurazione non si chiude più con un click sul backdrop (un misclick scartava i dati digitati); Esc e ✕ restano attivi.
- ESLint: ignorati `builds/` e `.claude/` (worktree); fix violazione `set-state-in-effect` nel Timer. `npm run lint` ora passa pulito.
- Bump versione 0.5.7 → 0.5.8.

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
