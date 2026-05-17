# Roadmap — Runtime StreamFlow

Documento ripristinato dalla conversazione strategica originale (Gemini AI Studio, 5 Mar 2026).
Aggiornato con lo stato reale al 17 Maggio 2026 (v0.3.0).

---

## Stato attuale (v0.3.0)

| Obiettivo | Stato | Note |
|---|---|---|
| Streaming solido HTTP PUT | ✅ Completato | Motore rock-solid, compatibile AzuraCast/Icecast |
| Interfaccia dark mode | ✅ Completato | VU Meter, Timer, OnAir Button |
| Setup funzionante | ⚠️ Parziale | Richiede conoscenza manuale di mount point, host, porta |
| Stabilità critica (G1/G2/G3) | ✅ Completato | Fix timeout, race condition AudioContext, lock connecting |
| Gestione copertine / cover art | ❌ Non iniziato | Era il "Killer Feature" originale |
| Registrazione locale | ❌ Non iniziato | Prevista sin dall'inizio, mai implementata |
| Integrazione API AzuraCast | ❌ Non iniziato | Auto-configurazione e metadata |

---

## FASE A — UX "Wow" (Priorità: Alta)

Trasformare l'app da utility funzionale a prodotto con personalità.

- **VU Meter avanzato** — rendering fluido stile console analogica/digitale moderna, non solo barre lineari
- **Feedback visivo ON AIR potenziato** — quando sei live, l'app deve "pulsare" con un cambio cromatico di accento più evidente sull'intera interfaccia
- **Onboarding wizard** — al primo avvio, invece del pannello settings freddo, un wizard guidato: "Benvenuto su Runtime StreamFlow. Incolla qui la tua API Key di AzuraCast per configurare tutto automaticamente"

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

### B2 — Pannello "Now Playing" + Cover Art
1. Pannello dedicato nell'app: titolo, artista, copertina corrente
2. Campi editabili per aggiornare titolo/artista in tempo reale durante la diretta
3. **Drag & Drop cover art** — l'utente trascina un JPG/PNG nell'app
4. L'app ridimensiona l'immagine al formato corretto
5. L'app chiama le API AzuraCast (`/api/station/{id}/art`) e fa l'upload
6. La copertina cambia immediatamente sul player web degli ascoltatori

*Questo è ciò che rende StreamFlow superiore a BUTT.*

---

## FASE C — Resilienza e Registrazione (Priorità: Media)

### C1 — Auto-Reconnect
Se la linea cade durante una diretta, l'app riprova la connessione automaticamente ogni 5 secondi con backoff esponenziale, senza che l'utente debba fare nulla. Nessuna interruzione percepita se il problema è temporaneo.

### C2 — Registrazione locale
Toggle "Registra su file" che salva una copia MP3 della diretta in locale mentre si trasmette. Utile per podcast, archivio, replay.
Implementazione: FFmpeg sdoppia l'output con `-f tee` — costo computazionale quasi zero perché l'encoding avviene una volta sola.

---

## Feature future / Fase D (Backlog)

Idee emerse nella conversazione originale, da valutare dopo le Fasi A/B/C:

- **Profili multipli** — salvataggio di configurazioni server diverse (es. stazione principale / backup / test)
- **Supporto Linux** — lo stack Electron lo permette, richiede solo il porting dell'audio input da DirectShow a PulseAudio/ALSA
- **Supporto macOS** — Electron supporta macOS nativamente, richiede testing e fix handler `activate`
- **Statistiche diretta** — bitrate effettivo, uptime, KB trasmessi
- **Notifiche sistema** — avviso desktop se la connessione cade

---

## Note strategiche

> "NON aggiungere subito nuove funzioni. Prima testa la stabilità in una vera diretta.
> Se il test passa, attacca subito la FASE B (Integrazione AzuraCast & Copertine).
> È lì che il valore del software esploderà."
> — Gemini, 5 Mar 2026

La raccomandazione è ancora valida. Prima di aggiungere qualsiasi feature:
1. Testare v0.3.0 in una diretta reale (almeno 1 ora)
2. Verificare che CPU, RAM e audio siano stabili
3. Completare i fix GRAVI dalla code review (V1-V4) se necessario
4. Poi attaccare Fase B
