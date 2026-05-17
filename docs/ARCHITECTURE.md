# Architettura StreamFlow

StreamFlow è strutturato su tre processi Electron separati che comunicano via IPC. Questa separazione garantisce sicurezza (il renderer non ha accesso diretto al filesystem o ai processi di sistema) e stabilità (un crash nel renderer non abbatte il processo di streaming).

## Struttura a 3 Layer

```
┌─────────────────────────────────────────┐
│  RENDERER PROCESS  (React 19)           │
│  src/renderer/                          │
│  • App.tsx — root, orchestrazione UI    │
│  • components/ — OnAirButton, VuMeter,  │
│    SettingsPanel, Timer, Toast          │
│  • hooks/ — useAudioDevices,            │
│    useAudioVisualizer                   │
│  • store/ — Zustand (persist)           │
└──────────────┬──────────────────────────┘
               │ contextBridge (window.electronAPI)
┌──────────────▼──────────────────────────┐
│  PRELOAD SCRIPT  (Bridge sicuro)        │
│  src/preload/index.ts                   │
│  • startStream(config)                  │
│  • stopStream()                         │
│  • getAudioDevices()                    │
│  • onStreamStatus(cb) → unsubscribe()   │
└──────────────┬──────────────────────────┘
               │ ipcMain / ipcRenderer
┌──────────────▼──────────────────────────┐
│  MAIN PROCESS  (Node.js backend)        │
│  src/main/                              │
│  • main.ts — lifecycle Electron         │
│  • ipc.ts — handler IPC                 │
│  • streaming/ffmpeg-manager.ts          │
│    StreamManager: spawn/kill FFmpeg     │
└─────────────────────────────────────────┘
```

**Configurazione sicurezza Electron:**
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: false` (necessario per spawn FFmpeg)

## Flusso Audio

```
Dispositivo audio (Windows DirectShow)
          │
          │  -f dshow -i "Nome Dispositivo"
          ▼
    FFmpeg (child process)
          │
          │  -acodec libmp3lame -ab 128k -ar 44100
          ▼
    HTTP PUT → Icecast / AzuraCast
```

**Parametri FFmpeg rilevanti:**
```
-f dshow
-acodec libmp3lame -ab 128k -ar 44100
-content_type audio/mpeg
-method PUT
-chunked_post 0
-headers "User-Agent: FMLE/3.0\r\nExpect:\r\nIce-Public: 1\r\n"
```

- `chunked_post 0` — necessario per compatibilità con Icecast/AzuraCast moderni
- `Expect:` vuoto — rimuove l'header `Expect: 100-continue` che causa connection reset
- `User-Agent: FMLE/3.0` — emula Flash Media Live Encoder per massima compatibilità server

## State Machine dello Streaming

```
        [disconnected]
              │
     startStream(config)
              │
              ▼
        [connecting]
         │         │
   FFmpeg scrive   timeout / errore stderr
   bytes sullo     │
   stream          ▼
         │      [error] ──→ toast con ultime 3 righe stderr
         ▼
      [connected]  ←──── ON AIR
         │
     stopStream()
         │
         ▼
    [disconnected]
```

La transizione `connecting → connected` avviene solo quando FFmpeg conferma l'invio di dati effettivi (evento `size`/`time` nello stderr), non su un timeout cieco.

## Gestione Stato (Zustand)

Lo store Zustand usa `partialize` per separare stato persistente da stato volatile:

**Persistito in localStorage:**
- `selectedDeviceId`, `selectedDeviceLabel`
- `streamConfig` — host, port, username, password, mount

**Volatile (azzerato al riavvio):**
- `isStreaming`, `streamStatus`
- `errorMessage`

## Visualizzatore Audio (VU Meter)

Il VU Meter usa Web Audio API nel renderer, indipendente da FFmpeg:

```
getUserMedia(deviceId)
      │
      ▼
AudioContext → AnalyserNode
      │
      │  getFloatTimeDomainData() → RMS
      ▼
Canali L e R indipendenti → 60 FPS via requestAnimationFrame
```

Il mapping tra nome dispositivo DirectShow (fornito da FFmpeg nel main process) e `deviceId` Chrome (necessario per `getUserMedia`) avviene tramite text-match sul label del dispositivo enumerato da `navigator.mediaDevices.enumerateDevices()`.

## Enumerazione Dispositivi Audio

```
Main Process: ffmpeg -list_devices true -f dshow -i dummy
      │
      │  parse stderr → estrai righe con tag "(audio)"
      ▼
IPC → Renderer → dropdown SettingsPanel
```

L'output stderr viene bufferizzato atomicamente e processato solo all'evento `close` del processo FFmpeg, per evitare parsing su chunk parziali.

## Cleanup Processi

Alla chiusura dell'app o allo stop dello stream:

- **Windows**: `taskkill /pid <PID> /f /t` — termina FFmpeg e tutti i processi figlio
- **Unix**: `process.kill(pid, 'SIGKILL')`
- **before-quit**: listener Electron che garantisce il cleanup anche su chiusura finestra con stream attivo
