# Roadmap — Runtime StreamFlow

Documento ripristinato dalla conversazione strategica originale (Gemini AI Studio, 5 Mar 2026).
Aggiornato al 29 ottobre 2026 (v0.9.0 · Solid Snake): repository pubblico e aggiornamento automatico fatti; restano licenza, preset e le lievi dell'analisi (vedi sotto).
Prima: 27 settembre 2026 (v0.8.6), StreamFlow programma a sé e futuro software libero.
Precedente cambio di direzione: 24 luglio 2026 (v0.7.0), client interno Runtime Radio.

---

## ⛔ DECISIONI DEL 27 SETTEMBRE 2026 — prevalgono su tutto quello che segue

### 1. StreamFlow è un programma a sé: non sarà fuso con Live Machine Pro

Decisione definitiva di Simone. StreamFlow **può lavorare in tandem** con Runtime Live
Machine Pro, ma chi trasmette **può scegliere qualunque altro software di regia**.

- Nessuna dipendenza da Live Machine Pro: ogni integrazione con lei è **facoltativa** e
  StreamFlow deve funzionare pienamente anche senza.
- Resta il caso d'uso che definisce il programma: lo **speaker autonomo**, con un microfono
  USB e la regia sul proprio PC, che va in onda **senza virtual cable né configurazioni
  audio**. La MIX MODE ne è il cuore: prende l'audio del PC qualunque sia il programma che
  lo suona.
- La fusione non va più riproposta.

**Precisazione di Simone (stesso giorno):** anche se non si uniranno mai, StreamFlow e Live
Machine Pro **restano pensati per il team di Runtime Radio**. Quando saranno completi se ne
faranno **versioni universali, per tutti**.

### 2. StreamFlow diventerà software libero

Come già fatto con *Runtime TelegramBot Desktop Titan Edition* (12–13 agosto 2026),
*Runtime FeedDownloader Pro* (18 agosto 2026) e *Runtime Live Machine Pro* (13 settembre
2026). Obiettivi:

- ✅ **repository pubblico** — fatto il 29/10/2026: `Pitz72/StreamFlow-`, su richiesta
  diretta di Simone, prima della sessione dedicata. **Manca la licenza** (gli altri tre
  sono MIT): finché non c'è, il codice è visibile ma non riutilizzabile;
- ✅ **release pubblicate nello stesso repository**, con il token integrato di GitHub —
  workflow «Build & Release», solo manuale (0.9.0);
- ✅ **aggiornamento automatico** con `electron-updater` (0.9.0): scarica in sottofondo,
  installa alla chiusura, mai durante una diretta;
- **eliminazione del repository ponte** `Ecosystem-Runtime/StreamFlow-Releases` — ancora
  da fare: non serve più a niente (nessuna versione lo interroga).

**Quando:** quello che resta (licenza, preset, repository ponte) in una sessione dedicata.
Il modello da seguire è `docs/PIANO-APERTURA.md` del repository di Live Machine Pro
(`Pitz72/RRLMP`). Primo atto di quella sessione: scrivere il `PIANO-APERTURA.md` di
StreamFlow.

**Punti già noti, da decidere o verificare in quella sede (elenco non completo):**

- ⛔ **Il preset di stazione.** Host e porta di Runtime Radio e i nomi utente dei DJ (uno è
  un indirizzo email) sono nel codice, nella storia git e nei log di `docs/log/`. Va deciso
  cosa diventa pubblico e come: preset configurabile, storia conservata o no. La direzione
  «client interno» del 24 luglio (sezione qui sotto) va ridefinita.
- ✅ **Aggiornamento automatico costruito** (0.9.0). Le versioni fino alla 0.8.7 non lo
  hanno: gli studi installano a mano, un'ultima volta, la 0.9.0.
- **Repo ponte senza traghetto?** Pubblica solo la v0.6.0 e nessuna versione installata la
  interroga (non esiste un updater): con ogni probabilità si può cancellare subito, come per
  FeedDownloader. Da verificare.
- ✅ **Destinazione:** `Pitz72/StreamFlow-`, pubblico dal 29/10/2026. Il trattino finale
  del nome è rimasto: cambiarlo ora sposterebbe anche l'indirizzo da cui l'app installata
  legge gli aggiornamenti (`build.publish` in `package.json`).
- ⚠️ **Il preset è già pubblico**: con la repo aperta, host, porta e nomi utente dei DJ
  (codice, storia, log) sono visibili a tutti. Le password no. Resta da decidere se
  togliere i nomi dal codice o cambiarli su AzuraCast.
- **File di licenza assente**; `package.json` è `"private": true` e senza campo `license`.

### 3. Lievi rimaste dall'analisi del 29 ottobre 2026

Dall'[analisi](./ANALISI-2026-10-29.md), messe in roadmap da Simone il 29/10:

Lavorate nella 0.10.1 ([log](./log/0.10.1.md)):

- ✅ **L4 — Password negli argomenti di FFmpeg.** Chiusa come rischio motivato: su
  Windows li leggono solo i processi dello stesso utente, che possono già decifrare la
  password memorizzata (DPAPI è per utente). Il FFmpeg incluso è la 6.1.1, senza
  `-/opzione file`. L'unica strada vera sarebbe un relay locale che aggiunga l'header:
  tocca il cuore della trasmissione, ma leggerebbe anche la risposta del server (il
  401 oggi arriva travestito da -10054). Idea per il futuro, non una lieve.
- ✅ **L6 — README** riscritto.
- ✅ **L8 — Costo di `PresentazioneContinua`.** Misurato: a finestra ridotta a icona
  Chromium lo porta già a ~1 fotogramma al secondo; a finestra visibile il costo è il
  rimedio stesso. Niente da alleggerire senza rischio. Trovato invece che il VU teneva
  il microfono acceso a finestra ridotta: corretto.
- ✅ **L9 — Installer non firmato.** Chiusa per decisione di Simone (29/10/2026): come
  gli altri programmi open source di Runtime, StreamFlow non si firma. Non riproporre.
- ✅ **L10 — Password con lettere accentate.** UTF-8 in tutti e tre i punti, la
  codifica con cui AzuraCast le confronta (`azuracast.dj_auth` le passa in JSON alla
  sua API). Fissato da due test. La prova sul server vero con un account di test resta
  utile, ma non è più un dubbio sul codice.
- **Solo Windows** all'apertura: Linux è sospeso dalla 0.8.6.
- **Credito ai modelli.** Trailer `Co-Authored-By` contati il 27/09: Claude Opus 5 (17),
  Sonnet 4.6 (12), Opus 4.7 (11), Fable 5 (10), Opus 5.5 (4), Opus 4.8 (4). La fase di marzo
  con Gemini non ha trailer. Elenco da confermare con Simone.
- **Audit dei segreti** su tutta la storia, da fare.

---

## 🧭 CAMBIO DI DIREZIONE (24 Lug 2026, v0.7.0)

> ⚠️ **In parte superato dalle decisioni del 27 settembre** (sopra): StreamFlow diventerà
> pubblico. Il preset Runtime Radio resta il caso d'uso da cui nasce il programma; come
> conviverà con un repository pubblico si decide nella sessione di apertura.

StreamFlow è ora il **software ufficiale INTERNO di Runtime Radio**, non un client generico da distribuire. Conseguenze:

- **Preset di stazione hardcoded** (`stationPreset.ts`): host/porta/mount/bitrate fissi, validati in diretta. L'utente sceglie solo il nome utente DJ dalla tendina + password (memorizzabile cifrata via safeStorage).
- **Archiviata la priorità "generalizzazione multi-sistema"** (Icecast puro/Shoutcast): il core HTTP PUT resta generico, ma non è più un obiettivo di prodotto. Wizard AzuraCast e profili server rimossi (recuperabili dalla history git).
- **Le priorità diventano le feature di conduzione**: registrazione locale (C2), VU meter post-gain, statistiche live (C4), tray + hotkey (E1) — ciò che serve ai DJ della radio, non al mercato.
- **Elenco DJ da completare** nel preset (oggi solo Simone): servono gli username AzuraCast degli altri conduttori.

---

## 🎉 MILESTONE (13 Lug 2026): stabilizzazione conclusa e validata in diretta

La 0.6.0 ha superato la prova del campo: **~1h30 di diretta + 1h di preshow con rotazione musicale, zero interruzioni/errori**, metadata inviati correttamente al player AzuraCast, volume input regolabile in diretta (udibile in ricezione). Obiettivo dichiarato: **sostituire BUTT**.

## Stato attuale (v0.6.0)

| Obiettivo | Stato | Note |
|---|---|---|
| Streaming solido HTTP PUT | ✅ Validato in diretta | Motore rock-solid, 2h30 senza intoppi |
| Interfaccia dark mode + modali | ✅ Completato | VU Meter fluido, Timer, OnAir, StreamLog |
| Audit 31 problematiche (gravissime→lievi) | ✅ Interamente evaso | v0.5.7 + v0.5.8, vedi `AUDIT-2026-07-13.md` |
| C1 — Auto-reconnect backoff | ✅ Implementato (v0.5.7) | Non ancora stressato da un drop reale |
| Now Playing / metadata | ✅ Validato in diretta | Raw socket BUTT-compat, arriva rapido al player |
| Integrazione AzuraCast (wizard) | ✅ Completato | Auto-config one-click (opzionale) |
| D1 — Volume input LIVE | ✅ Implementato (v0.6.0) | Via azmq + client ZMTP puro-Node |
| Generalizzazione multi-sistema | 🗄️ Archiviata (24 Lug) | StreamFlow è ora client interno Runtime Radio preconfigurato |
| Registrazione locale (C2) | ✅ Implementata (v0.7.1) | Muxer tee, un solo encoding, onfail=ignore sul file |
| VU meter post-gain | ✅ Implementato (v0.7.1) | Moltiplicatore visivo dallo store, pipeline invariata |

---

## Fix pendenti — Criticità MEDIE (da code review v0.3.0)

Da risolvere prima di nuove feature. Nessuna modifica funzionale visibile, solo pulizia e correttezza.

### M1 — VuMeter: prop `active` ignorata
**File:** `src/renderer/components/VuMeter.tsx:9`
La prop `active` è dichiarata in `VuMeterProps` e passata da `App.tsx`, ma viene distrutta fuori dal destructuring — il meter gira sempre, anche da fermo. Questo è intenzionale per il pre-check microfono, ma va reso esplicito nel codice (rinominare prop o usarla per modulare l'opacità visiva in stato OFF vs ON AIR).

### M2 — Bitrate hardcoded a 128kbps
**File:** `src/main/streaming/ffmpeg-manager.ts:108`
`-ab 128k` è fisso. Stazioni diverse usano 64/96/128/192/320kbps. Aggiungere `bitrate` a `StreamConfig` e renderlo configurabile dal settings panel.

### M3 — Nessuna validazione input in SettingsPanel
**File:** `src/renderer/components/SettingsPanel.tsx`
Porta non-numerica, host vuoto o mount senza slash iniziale arrivano diretti a FFmpeg. Aggiungere validazione client-side prima dell'invio (o bloccare il pulsante GO ON AIR se il config è incompleto/invalido).

### M4 — Console.log in produzione
**File:** `src/renderer/App.tsx:25`, `src/main/streaming/ffmpeg-manager.ts:97-99,118`
Log di debug attivi in build di produzione. I log di ffmpeg-manager stampano il path del binario e l'URL (senza password, ok) — da rimuovere o wrappare in un flag `isDev`.

---

## Fix pendenti — Criticità LIEVI

### L1 — `env.d.ts`: `icecastUser` opzionale ma required nel resto
**File:** `src/renderer/env.d.ts:7`
`icecastUser?: string` è dichiarato opzionale nella type declaration di `window.electronAPI`, ma in `StreamConfig` di `useStore.ts` e `ffmpeg-manager.ts` è required. Rendere il tipo coerente (required ovunque).

### L2 — VuMeter: prop tipizzata ma mai letta
**File:** `src/renderer/components/VuMeter.tsx`
TypeScript non vede errori perché la prop è nella interface, ma non è mai usata nel body. Da chiarire design intent e allineare il codice alla scelta fatta.

### L3 — `useAudioVisualizer`: ref inizializzato con `undefined` invece di `null`
**File:** `src/renderer/hooks/useAudioVisualizer.ts:8`
`useRef<number>(undefined)` — il tipo corretto è `useRef<number | null>(null)` per coerenza con il resto dei ref nel file e con la convenzione React.

---

## FASE A — UX "Wow" (Priorità: Alta)

Trasformare l'app da utility funzionale a prodotto con personalità.

### A1 — VU Meter avanzato
Il VU Meter attuale è funzionale ma statico. Upgrade a console analogica/digitale moderna:
- **Peak hold indicator**: piccolo segmento LED che rimane alla posizione di picco per 1-2s prima di decadere, stile broadcast professionale
- **Scala dBFS reale**: da -60 a 0 dBFS invece di 0-100%, con tacche di riferimento a -12, -6, -3 dB
- **Clipping flash**: quando il segnale tocca 0 dB, l'intero meter lampeggia rosso (indica saturazione)
- **Visivo ON AIR vs monitor**: usare la prop `active` per mostrare il meter con accento rosso quando in diretta vs verde/neutro in pre-check

### A2 — Feedback visivo ON AIR potenziato
Quando sei live, l'utente deve sentirlo a colpo d'occhio anche dal corner dell'occhio:
- **Border glow dell'intera finestra**: ring rosso pulsante intorno ai bordi dell'app (CSS box-shadow sull'elemento root)
- **Color shift dell'accento UI**: i colori di accento dell'intera interfaccia slittano verso il rosso quando streaming è attivo (Tailwind CSS variables)
- **System tray icon**: icona nella barra di sistema cambia da grigia a rossa con punto ON AIR
- **Taskbar badge Windows**: badge rosso sul pulsante taskbar durante la diretta (Electron API nativa)

### A3 — Wizard onboarding al primo avvio
Al primo avvio, invece del settings panel freddo, un wizard a step:
1. "Benvenuto su Runtime StreamFlow" — spiega cosa fa l'app
2. "Hai un server AzuraCast?" → sì: inserisci URL + API Key e l'app configura tutto — no: inserisci manualmente host/porta/credenziali
3. "Seleziona il microfono/mixer" con test VU Meter integrato nel wizard stesso
4. "Tutto pronto — vai in diretta"

### A4 — Fade in / Fade out audio [NUOVO]
Start e stop dello stream con dissolvenza audio invece di taglio netto. Evita il "click" udibile agli ascoltatori.
- Fade in: 1-2 secondi all'avvio (`-af afade=t=in:d=2` in FFmpeg, costo zero)
- Fade out: 1-2 secondi prima dello stop
- Toggle configurabile nel settings (alcuni preferiscono il taglio netto)

---

## FASE B — Integrazione AzuraCast (Priorità: Alta — Il Killer Feature)

Questa è la feature che distacca StreamFlow da BUTT e da qualsiasi alternativa esistente.

### B1 — Auto-configurazione One-Click
L'utente incolla URL della stazione + API Key di AzuraCast. L'app scarica da sola:
- Nome radio
- Mount Point corretto
- Porta di streaming
- Credenziali DJ

Fine degli errori di configurazione manuale.

Miglioramenti rispetto al piano originale:
- **Test di connessione visibile** durante il fetch API (spinner + feedback esplicito)
- **Selezione mount point** se la stazione ne ha più di uno (AzuraCast supporta mount multipli per qualità diverse)
- **Profili multipli**: salva più configurazioni (stazione principale / backup / test) e passa da una all'altra con un click

### B2 — Cover Art ❌ RIMOSSA in v0.5.4
Feature inizialmente prevista per drag&drop cover via API AzuraCast. **Cancellata** perché:
- L'endpoint `POST /api/station/{id}/art` non esiste (era una assunzione errata della v0.5.0).
- Gli endpoint reali (`/files/{mediaId}/art`, `/streamer/{id}/art`) coprono casi d'uso diversi.
- AzuraCast mostra già l'immagine profilo dello streamer ON AIR + fa lookup automatico MusicBrainz/Last.fm dai metadata Icecast inviati correttamente dalla v0.5.3.
- Replicare l'admin UI dall'app non aggiunge valore.

### B3 — Now Playing via Icecast nativo [NUOVO]
Per chi usa Icecast puro senza AzuraCast: anche Icecast supporta l'aggiornamento del titolo corrente tramite HTTP GET a `/admin/metadata?mount=...&song=...`. Più semplice da implementare di B2 (nessuna API key, nessun JSON) e funziona con qualsiasi server Icecast standard. Implementabile come B2-lite: campo testuale "Ora in onda" con pulsante "Aggiorna" che fa la chiamata HTTP in background.

---

## FASE C — Resilienza e Produzione (Priorità: Media)

### C1 — Auto-Reconnect
Se la linea cade durante una diretta, l'app riprova la connessione automaticamente con backoff esponenziale (5s, 10s, 20s... fino a 5 minuti). L'utente non deve fare nulla.

Miglioramenti rispetto al piano originale:
- **Countdown visivo**: "Riconnessione in 4s..." mostrato nell'UI durante l'attesa
- **Stato visivo dedicato**: colore arancione per "Reconnecting" (distinto da giallo "Connecting")
- **Limite massimo**: dopo N tentativi falliti, passa a stato di errore definitivo con notifica
- **Log reconnect**: storico degli eventi di disconnessione con timestamp, utile per debug

### C2 — Registrazione locale
Toggle "Registra su file" che salva una copia MP3 della diretta in locale mentre si trasmette.
Implementazione: FFmpeg sdoppia l'output con `-f tee` — l'encoding avviene una volta sola, costo computazionale quasi zero.

Miglioramenti rispetto al piano originale:
- **Auto-naming**: `RuntimeStreamFlow_{YYYY-MM-DD_HH-mm}.mp3` nella cartella Documenti
- **Split on disconnect**: se la connessione cade e riprende (auto-reconnect), ogni sessione va in un file separato
- **Cartella configurabile** nel settings panel
- **Qualità separata**: la registrazione locale può essere a qualità maggiore dello stream (es. 320kbps locale vs 128kbps stream)

### C3 — Stream verso server multipli [NUOVO]
Inviare lo streaming a due server simultaneamente: main + backup/archivio. FFmpeg supporta output multipli nativamente con `-f tee "[f=mp3]url1|[f=mp3]url2"`. Utile per:
- **Failover manuale**: stream verso stazione principale + CDN di backup
- **Archivio cloud**: stream verso server principale + registrazione remota su server di archivio
- Due profili di qualità diversa verso server diversi

### C4 — Statistiche diretta in tempo reale [NUOVO]
Durante la live, mostrare un pannello statistiche estratto dal parsing stderr di FFmpeg (già parzialmente implementato in `ffmpeg-manager.ts`):
- **Bitrate effettivo**: FFmpeg stampa `size= 123kB time=00:01:30 bitrate= 128.0kbits/s`
- **KB trasmessi totali**
- **Uptime** (già abbiamo il timer, da collegare)
- **Latenza stimata**: `size` / `bitrate` dà un'idea del buffer/latenza

---

## FASE D — Audio Pro [NUOVA]

Feature per utenti avanzati che vogliono controllo professionale sull'audio senza strumenti esterni.

### D1 — Livello input configurabile
Slider del volume di ingresso nel settings panel. FFmpeg gestisce con `-af volume=Xdb` o `-af volume=X`. Risolve il problema più comune dei radio speaker: "il mio microfono è troppo basso/alto e non voglio toccare i driver Windows".

### D2 — Qualità e codec configurabili
Dropdown nel settings:
- **Bitrate**: 64 / 96 / 128 / 192 / 320 kbps
- **Codec**: MP3 (libmp3lame, compatibilità massima), AAC (aac, qualità superiore a parità di bitrate), Opus (libopus, futuro web)
- **Sample rate**: 44100 / 48000 Hz

Cost implementazione: minimissimo (argomenti FFmpeg già strutturati in config object).

### D3 — Mixer Mic + System Audio [NUOVO]
Mixare il microfono con l'audio di sistema (es. VB-Cable, Stereo Mix su Windows) con volumi indipendenti. FFmpeg accetta input multipli con `amix`. Permetterebbe di trasmettere musica + voce senza software di routing esterno. Risolve il caso d'uso più richiesto: "voglio parlare sopra la musica che sto trasmettendo".

### D4 — Soundboard / Jingle pad [NUOVO]
Pannello con 6-8 pulsanti, ciascuno mappato a una clip audio (jingle, stacco musicale, effetto sonoro). Click → FFmpeg mixa il file nell'output stream in tempo reale. Nessuna alternativa gratuita integra soundboard + streaming in una sola app. Feature di differenziazione forte rispetto a BUTT.

### D5 — Pre-ascolto / Monitor [NUOVO]
Sentire via cuffie esattamente quello che va in onda (loopback). Utile per:
- Verificare la qualità audio prima/durante la diretta
- Monitorare il livello reale dopo il processing FFmpeg
Web Audio API → AudioContext → outputDevice selezionata (API `setSinkId`). Funziona lato renderer senza modifiche al processo FFmpeg.

---

## FASE E — Integrazione e Automazione [NUOVA]

### E1 — System Tray + Hotkey globali
- Icona nella system tray con stato visivo (grigio spento / rosso live)
- Menu contestuale: Start / Stop / Apri finestra / Esci
- **Hotkey globali** (Electron `globalShortcut`): go live / stop live senza toccare la tastiera quando si ha il microfono in mano
- Avvio minimizzato nel tray (opzione settings)

### E2 — Notifiche di sistema
Avviso desktop nativo (Windows/macOS/Linux) quando:
- La connessione cade inaspettatamente
- L'auto-reconnect ha successo
- La registrazione locale raggiunge una soglia di dimensione (es. 1GB)

### E3 — Streaming programmato [NUOVO]
Impostare orario di start/stop automatico. Utile per:
- Slot di programmazione automatica
- Streaming notturno non presidiato
- Backup automatico di eventi pianificati
Implementazione: `node-schedule` o semplice `setTimeout` basato su `Date`.

---

## FASE F — Platform (Backlog)

| Feature | Note |
|---|---|
| **Supporto Linux** | Electron lo permette; richiede porting audio da DirectShow → PulseAudio/ALSA. `getWindowsAudioDevices()` va astratto. |
| **Supporto macOS** | Electron supporta macOS nativamente. Richiede porting DirectShow → CoreAudio, testing, fix handler `activate` (V4 già risolto). |
| **Profili server multipli** | Save/load configurazioni named (stazione principale / backup / test). Prerequisito parziale già in B1. |
| **Auto-update** | Electron-updater per aggiornamento automatico in-app. |

---

## Ordine di esecuzione consigliato

```
v0.3.2  Fix MEDIE (M1-M4) + Fix LIEVI (L1-L3)                      [✅]
v0.4.0  FASE A: VU Meter avanzato + Feedback ON AIR + Fade in/out  [✅]
v0.5.0  FASE B: AzuraCast One-Click + Now Playing (B1+B3)          [✅, B2 rimossa in v0.5.4]
v0.5.1  Fix harbor AzuraCast/Liquidsoap + refactor UI a modali     [✅]
v0.5.2  Now Playing 2-fields + Input Volume + validazione metadata [✅]
v0.5.3  Metadata BUTT-compat via raw socket + StreamLog            [✅]
v0.5.4  Rimossa feature Cover Art (endpoint inesistente)           [✅]
v0.5.5  Fix visibilità StreamLog                                   [✅]
v0.5.6  Input Volume spostato in home                              [✅]
v0.5.7  Audit: 3 gravissime (race FFmpeg, error spurio, C1 reconnect) [✅]
v0.5.8  Audit: tutte le gravi/medie/lievi (hardening completo)      [✅]
v0.5.9  Fix VU meter fluido (ref DOM + backgroundThrottling)        [✅]
v0.6.0  Volume input LIVE (azmq + client ZMTP puro-Node)           [✅ VALIDATO IN DIRETTA]
─────── stabilizzazione conclusa ───────
v0.7.0  RUNTIME RADIO EDITION: preset interno + tendina DJ +        [✅]
        password cifrata (safeStorage) — wizard e profili rimossi
─────── da qui: feature di conduzione per i DJ della radio ───────
v0.7.1  Elenco DJ completo (4 studi) + C2 Registrazione locale (tee) [✅]
        + VU meter post-gain + icona REC — prima build consegnabile
v0.8.0  C4 Statistiche live (bitrate/KB/uptime da stderr FFmpeg) + E1 tray/hotkey + E2 notifiche
v0.9.x  FASE D: codec configurabile (AAC/Opus), mixer mic+sistema, soundboard
v1.0.0  Stabilizzazione finale, auto-update, documentazione utente
```

**Nota direzione (24 Lug 2026):** la generalizzazione multi-sistema (nota del 13 Lug) è **archiviata**: StreamFlow è il client interno di Runtime Radio, preconfigurato. Le energie vanno sulle feature che migliorano la conduzione quotidiana.

Feature avanzate (D3 Mixer, D4 Soundboard, D5 Monitor, C3 Stream multipli, E3 Schedule) da valutare dopo v1.0 in base al feedback utenti reali.

---

## Note strategiche

> "NON aggiungere subito nuove funzioni. Prima testa la stabilità in una vera diretta.
> Se il test passa, attacca subito la FASE B (Integrazione AzuraCast & Copertine).
> È lì che il valore del software esploderà."
> — Gemini, 5 Mar 2026

La raccomandazione resta valida. L'ordine esecuzione consigliato la rispetta:
1. Fix di pulizia (M/L) prima di qualsiasi feature
2. UX "Wow" per rendere il prodotto piacevole da usare
3. AzuraCast come differenziatore principale rispetto a BUTT
4. Feature audio pro solo dopo aver validato il core con utenti reali
