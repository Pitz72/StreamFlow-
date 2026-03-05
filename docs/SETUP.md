# Guida Setup Sviluppo

Questa guida ti aiuterà a configurare l'ambiente locale per contribuire a StreamFlow.

## 🛠️ Prerequisiti

- **Node.js**: Versione 20 o superiore.
- **npm**: Incluso con Node.js.
- **Sistema Operativo**: Windows (consigliato per il supporto DirectShow audio).

## 🚀 Comandi Principali

### Installazione
```bash
npm install
```

### Sviluppo (Live Reload)
Avvia il server di sviluppo Vite e l'applicazione Electron contemporaneamente:
```bash
npm run electron:dev
```

### Compilazione e Packaging
Genera i file distribuiti e l'installer eseguibile in `builds/`:
```bash
npm run electron:build
```

## 📝 Note Tecniche Specifiche

### Audio su Windows (DirectShow)
Il backend utilizza `dshow` per enumerare i dispositivi. Se un dispositivo non viene riconosciuto:
1.  Verifica che il nome non contenga caratteri speciali non supportati.
2.  Controlla i log in console (Main Process) per vedere il nome "pulito" generato da `ffmpeg-manager.ts`.

### Troubleshooting Build
Se la build fallisce con errori relativi a file corrotti o mancanti:
1.  Pulisci la cache di npm: `npm cache clean --force`.
2.  Cancella `node_modules` e `package-lock.json` e riesegui `npm install`.
3.  Attualmente utilizziamo **electron-builder v24.13.3** per garantire la stabilità su Windows.

---

> Hai dubbi? Consulta l'**[Indice Documentazione](./INDEX.md)**.
