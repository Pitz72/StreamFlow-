# Runtime StreamFlow

**StreamFlow** è un client desktop professionale per lo streaming audio verso server Icecast/Shoutcast e AzuraCast. Combina un motore di encoding robusto (FFmpeg) con un'interfaccia moderna in dark mode, pensato come alternativa a BUTT (Broadcast Using This Tool) per broadcaster e DJ radiofonici.

## Caratteristiche

- **Streaming HTTP PUT** — protocollo compatibile con AzuraCast, Icecast 2, e DJ Mode
- **VU Meter stereo real-time** — canali L/R indipendenti via Web Audio API a 60 FPS
- **Selezione dispositivo audio** — enumerazione diretta via FFmpeg DirectShow (Windows)
- **Timer di sessione** — HH:MM:SS con calcolo timestamp-based preciso al millisecondo
- **Notifiche errore non bloccanti** — toast con messaggio FFmpeg raw per diagnostica immediata
- **Persistenza configurazione** — credenziali e device salvati tra le sessioni

## Stack Tecnologico

| Layer | Tecnologia |
|---|---|
| Desktop | Electron 40 |
| Frontend | React 19, TypeScript, Tailwind CSS |
| State | Zustand 5 (con persist middleware) |
| Audio engine | FFmpeg via ffmpeg-static |
| Build | Vite 7, electron-builder |

## Avvio Rapido

```bash
npm install
npm run electron:dev
```

## Build Produzione

```bash
npm run electron:build
# Output: builds/ — installer NSIS per Windows
```

## Documentazione

- [Architettura](./docs/ARCHITECTURE.md) — struttura multi-processo, flusso audio, IPC
- [Setup sviluppo](./docs/SETUP.md) — prerequisiti, comandi, troubleshooting
- [Changelog](./docs/CHANGELOG.md) — cronologia versioni dalla 0.0.1

---

Versione attuale: **0.3.0** — Sviluppato da Runtime Radio
