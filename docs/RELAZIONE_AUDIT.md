# Relazione di Audit e Stato del Progetto: Runtime StreamFlow

**Data:** 5 Marzo 2026  
**Versione Attuale:** 0.1.6  
**Redatto da:** Sistema di Assistenza AI  

---

## 1. Analisi del Software: Concettuale e Pratica

### Che cos'è StreamFlow?
Concettualmente, **Runtime StreamFlow** è un client desktop progettato par soppiantare vecchi software di broadcasting (come BUTT) combinando un'interfaccia utente moderna con un motore di encoding solido. È pensato per le radio web (come RadioAnziano) o per trasmissioni audio continue, offrendo affidabilità da "appliance" in un formato visivamente accattivante.

### Come funziona (Pratica)
Il software è costruito su **Electron**, che fornisce l'infrastruttura per un'app desktop cross-platform, integrata con tecnologie web moderne.
L'architettura si divide in tre livelli:
1. **Renderer (Frontend):** Sviluppato in React 19, TypeScript e Tailwind CSS. Si occupa esclusivamente di disegnare l'interfaccia (VU Meter animati, bottoni On Air, timer, settings panel). Lo stato globale è gestito da **Zustand**, che salva le credenziali in modo persistente ma azzera correttamente lo stato della connessione al riavvio.
2. **Main Process (Backend):** Il cuore pulsante (Node.js). Qui risiede il gestore dell'encoder (`ffmpeg-manager.ts`). Quando l'utente preme "On Air", il Main process crea un sottoprocesso invisibile del binario `ffmpeg.exe` (Fornito via `ffmpeg-static`). FFmpeg cattura l'audio dal microfono di sistema (via `dshow` su Windows) e lo trasmette a un server Icecast remoto via HTTP PUT.
3. **Preload (Il Ponte):** Un ponte di sicurezza (`index.ts`) che espone metodi limitati (`window.electronAPI`) al frontend affinché possa parlare con il backend in modo sicuro (IPC - Inter-Process Communication).

---

## 2. Perché la situazione ora è migliorata drasticamente

Prima di questa sessione di "restauro intensivo", StreamFlow era un prototipo **estetico ma clinicamente morto**. La situazione era critica per diverse ragioni strutturali. Ora, le fondamenta sono solide e sicure.

### Il Cambio di Paradigma: 
1. **Rottura della bolla "Stale Code" (G1):** Prima, ogni volta che lanciavi l'ambiente di sviluppo (`npm run electron:dev`), le modifiche fatte al backend (Node.js) **non venivano mai compilate**. Electron leggeva un vecchio file compilato settimane prima. Si passavano ore a scrivere codice che letteralmente non veniva mai eseguito. **Ora:** Il sistema ricompila forzatamente backend e preload a ogni avvio. Sei sicuro che ciò che scrivi è ciò che gira.
2. **Il bug fantasma della Produzione (G2):** Il software funzionava (forse) sul PC dello sviluppatore, ma una volta creata la build di installazione (`.exe`), l'appliance esplodeva. Il binario di FFmpeg restava rinchiuso in un archivio inaccessibile (`app.asar`). **Ora:** Il sistema di building estrae fisicamente l'eseguibile, garantendo che lo streaming possa partire in produzione su qualsiasi macchina.
3. **Buchi neri di Memoria bloccati (G3):** C'era un grave problema (Memory Leak) nella ricezione degli stati. L'interfaccia accumulava ascoltatori IPC: al centesimo refresh, il sistema riceveva 100 comandi simultanei per la stessa azione. **Ora:** Il ponte IPC è immacolato, e si auto-distrugge quando non serve, mantenendo la memoria pulita.
4. **Strage dei Processi Orfani (V1):** Chiudendo la finestra dell'app con lo stream acceso, FFmpeg continuava a girare nell'ombra per l'eternità, tenendo in ostaggio il microfono del PC. Serviva riavviare il computer o usare il task manager manuale. **Ora:** Quando l'app viene chiusa, invia sicari informatici (`taskkill`) per eliminare drasticamente ogni processo FFmpeg figlio rimasto.
5. **Silenzio Assordante dei Crash (V3, V4):** Prima il software dava la "finta" illusione di funzionare attendendo arbitrariamente 2 secondi. Se falliva, bloccava tutto con un goffo *alert()* di Windows che freezava il programma. **Ora:** Il software "legge" lo stream dati di FFmpeg (se scrivi Byte, allora sei online, altrimenti no). Se fallisci, un bellissimo toast animato rosso appare senza mai interrompere la UX generale.

---

## 3. Cos'è stato fatto e la Roadmap per la Rinascita

Abbiamo completato l'intera **Fase 1** (Criticità Forensi/Gravissime) e la **Fase 2** (Criticità Gravi). 

### ✔️ Quello che ABBIAMO COMPLETATO (v0.1.1 -> v0.1.6):
- [x] **[G1]** Fix compilazione del compilatore Vite/TSC.
- [x] **[G2]** Fix pathing di `app.asar.unpacked` per FFmpeg.
- [x] **[G3]** Fix memory leak IPC listener dismounted.
- [x] **[V1]** Handler del ciclo di vita e pulizia processi Zombie.
- [x] **[V2]** Generazione formale dell'`env.d.ts` e sblocco della Type Safety su IPC.
- [x] **[V3]** Sradicamento framework `alert()` bloccante, sostituzione con Store-Toast UI.
- [x] **[V4]** Passaggio dal fallace *Timeout Connection* al *Realtime Byte Connection Listener*.

### 🚀 Quello che Manca per completare la Rinascita (Fase 3):

Il software è ora stabile, sicuro e resiliente a livello core. Quello che resta da "risanare" sono le **Medie / Lievi Criticità** che ci separano da una release candidate ineccepibile (v0.2.0 or 1.0.0).

**Fase 3: Media Gravità (Perfezione Ambientale)**
1. **[M1]** `App.css` morto: Vite ha depositato file che generano conflitti CSS sotto traccia con Tailwind. Dobbiamo disintegrare `App.css` e standardizzare in `index.css`.
2. **[M2]** Spazzatura ShadCN in `index.css`: Ci sono radici e variabili di un sistema UI vecchio non utilizzato (ShadCN). Appesantisce e confonde il DOM.
3. **[M3] Il vero nemico "DSHOW":** L'interfaccia chiede a React l'elenco dei microfoni, e Chrome risponde con array come `[Microfono (Realtek Audio)]`. Quando passiamo questo nome a FFmpeg `dshow` su windows, potrebbe non coincidere esattamente con il nome DirectShow crudo. Questo è il reponsabile principale del **mancato avvio secco** quando si cambia microfono. Bisogna usare un map o un probing `ffmpeg -list_devices`.
4. **[M4]** Il Timer ha un `useEffect` dipendente male, l'interfaccia potrebbe scattare.

**Fase 4: Cosmesi Costruttiva (L1, L2, C1)**
- Rimozione pulita dei commenti `//` inutili lasciati in giro come scorie radioattive.
- Eliminazione totale della diciture "require" vetuste nel `preload`.

Una volta chiusi i punti **M1-M4**, potremo dire che il **Progetto StreamFlow è rinato dalle ceneri ed è industrialmente pronto per l'uso.**
