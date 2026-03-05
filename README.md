# Runtime StreamFlow 🎙️

**StreamFlow** è un client desktop professionale per lo streaming audio su server Icecast/Shoutcast, progettato per la massima semplicità ed efficienza. Costruito con le tecnologie web più moderne per garantire stabilità e performance.

## 🚀 Caratteristiche principali

- **Streaming HTTP PUT**: Emulazione fedele del protocollo `BUTT` per massima compatibilità con AzuraCast e DJ Mode.
- **Audio Visualizer**: VU Meter in tempo reale basati su Web Audio API.
- **Supporto Windows DirectShow**: Selezione accurata e pulita dei dispositivi audio di sistema.
- **Design Moderno**: Interfaccia in Dark Mode con feedback visivo immediato (ON AIR status).
- **Leggero e Multi-processore**: Sfrutta la potenza di FFmpeg per l'encoding audio (MP3 128k 44.1kHz).

## 🛠️ Stack Tecnologico

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide React.
- **Backend/Desktop**: Electron 40, Node.js.
- **Engine Audio**: FFmpeg (via ffmpeg-static).
- **State Management**: Zustand (con persistenza selettiva).

## 📦 Installazione e Avvio Rapido

### Prerequisiti
- Node.js (v20+)
- npm

### Sviluppo
```bash
# 1. Installa le dipendenze
npm install

# 2. Avvia in modalità sviluppo
npm run electron:dev
```

### Build (Produzione)
```bash
# Genera l'installer per Windows (.exe)
npm run electron:build
```

## 📖 Documentazione

Tutta la documentazione dettagliata è disponibile nella cartella [`docs/`](./docs/):

- [**Indice Documentazione**](./docs/INDEX.md): Punto di partenza centrale.
- [**Changelog Unificato**](./docs/CHANGELOG.md): Cronologia di tutte le versioni.
- [**Architettura**](./docs/ARCHITECTURE.md): Dettagli tecnici sul funzionamento interno.
- [**Guida Setup**](./docs/SETUP.md): Istruzioni approfondite per gli sviluppatori.

---

*Sviluppato da **Runtime StreamFlow** - Versione attuale: **0.1.0***
