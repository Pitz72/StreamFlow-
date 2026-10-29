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
| `npm run electron:build` | Genera installer NSIS in `builds/` (solo locale, non pubblica niente) |

## Rilascio (aggiornamento ai DJ)

Un rilascio arriva a tutti gli studi con l'aggiornamento automatico, quindi parte solo a mano:

1. alzare `version` in `package.json` (una versione già pubblicata viene rifiutata);
2. scrivere la sezione `## [x.y.z]` in `docs/CHANGELOG.md`: diventa la nota di rilascio;
3. commit e push su `main`;
4. GitHub → **Actions** → **Build & Release** → **Run workflow**.

Il workflow fa test e build su Windows e pubblica la release in `Pitz72/StreamFlow-` con
`.exe`, `.blockmap` e `latest.yml`. Le app installate la trovano entro 6 ore (o al
prossimo avvio), la scaricano in sottofondo e, fuori dalla diretta, aprono la finestra
«Aggiornamento pronto»: «Installa ora» o «Più tardi» (si installa alla chiusura). Con `publish_release = false`
fa solo la build, scaricabile dagli artifact del workflow.

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
    components/   — OnAirButton, LevelMeter, SettingsPanel, Timer, StreamLog
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
