# Setup Sviluppo

## Prerequisiti

- **Node.js** v20 o superiore
- **npm** (incluso con Node.js)
- **Sistema operativo**: Windows (supporto DirectShow audio nativo)

## Installazione

```bash
npm install
```

## Comandi

| Comando | Descrizione |
|---|---|
| `npm run electron:dev` | Avvia in modalità sviluppo con live reload |
| `npm run electron:build` | Genera installer NSIS in `builds/` |

## Struttura Cartelle

```
src/
  main/           — Main process Node.js
    streaming/    — ffmpeg-manager.ts (StreamManager)
    ipc.ts        — handler IPC
    main.ts       — lifecycle Electron
  preload/        — Bridge IPC sicuro
    index.ts
  renderer/       — Frontend React
    components/   — OnAirButton, VuMeter, SettingsPanel, Timer, Toast
    hooks/        — useAudioDevices, useAudioVisualizer
    store/        — Zustand store
    App.tsx
docs/
  log/            — log tecnici per ogni versione
builds/           — output installer (generato da electron:build)
```

## Note Tecniche

### Audio Windows (DirectShow)

Il backend usa FFmpeg con `-f dshow` per enumerare e catturare i dispositivi. Se un dispositivo non viene riconosciuto nel dropdown:

1. Apri la console del Main Process (DevTools → aba "Main Process" in dev mode)
2. Cerca il nome esatto del dispositivo nell'output FFmpeg
3. Il nome deve corrispondere esattamente alla stringa DirectShow — senza prefissi come "Default -"

### Build: ffmpeg-static e asar

Il binario FFmpeg è estratto dall'archivio `.asar` tramite `asarUnpack` in `electron-builder.json`. Non modificare questa configurazione: senza `asarUnpack`, FFmpeg è inaccessibile nelle build di produzione.

### Troubleshooting Build

Se `electron:build` fallisce con errori `ENOENT` o zip corrotto:

```bash
npm cache clean --force
# Cancella node_modules e package-lock.json
npm install
npm run electron:build
```

La versione di electron-builder fissata è **v24.13.3** — non aggiornare senza test approfonditi su Windows.

### TypeScript — tsconfig multipli

Il progetto usa tre tsconfig separati:

| File | Scope |
|---|---|
| `tsconfig.json` | Root, references agli altri |
| `tsconfig.app.json` | Renderer (React, browser) |
| `tsconfig.main.json` | Main process + preload (Node.js) |

Non aggiungere file `src/main/` a `tsconfig.app.json` — causa conflitti di tipo tra ambiente browser e Node.
