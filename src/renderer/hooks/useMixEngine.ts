import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { readLevel, setNeedle, type NeedleRefs } from './vuNeedle';
import { resolveInputDeviceId } from './resolveInputDevice';

/**
 * MIX MODE — il mixer software per chi non ha un mixer.
 *
 * Somma due sorgenti dentro StreamFlow e ne manda il risultato a FFmpeg:
 *   1. il MICROFONO scelto in Configurazione (la voce);
 *   2. l'AUDIO DI SISTEMA in loopback (la musica: Runtime Live Machine Pro).
 *
 * Perché qui e non dentro FFmpeg: su Windows non esiste un device dshow che
 * catturi l'uscita audio, servirebbe il Missaggio Stereo o un driver virtuale —
 * cioè proprio la configurazione che questa modalità esiste per evitare. Il
 * loopback di Electron non chiede nulla all'utente. In più due device dshow
 * separati hanno clock indipendenti e dopo un'ora di diretta vanno in deriva:
 * qui la risincronizzazione la fa il grafo Web Audio.
 *
 * Il PCM esce a blocchi da un AudioWorklet (thread audio, non si ferma se la UI
 * è occupata o la finestra è in secondo piano) e viaggia via IPC fino a stdin
 * di FFmpeg. Dal filtro in poi la catena è quella di sempre.
 *
 * IMPORTANTE — il mix NON viene mai riprodotto: l'unico collegamento verso
 * `destination` passa da un gain a zero, che serve solo a tenere vivo il
 * worklet. Se suonasse, il loopback lo ricatturerebbe: un anello infinito.
 */

/** Deve combaciare con MIX_PCM in ffmpeg-manager.ts. */
const SAMPLE_RATE = 48000;
/** ~43 ms di audio per blocco: 23 messaggi IPC al secondo, ~8 KB l'uno. */
const CHUNK_FRAMES = 2048;
/** Sotto questo picco consideriamo il canale musica muto. */
const MUSIC_SILENCE_THRESHOLD = 6;

/**
 * LIMITATORE DI SICUREZZA. Somma di due sorgenti indipendenti, ciascuna con un
 * cursore che arriva al 200%: i picchi vanno fermati prima del worklet, che
 * altrimenti li taglia di netto (`if (sl > 1) sl = 1`, distorsione dura).
 *
 * I numeri non sono di listino, sono misurati sul DynamicsCompressorNode di
 * questo Chromium (log/0.8.2.md). Il motivo: il nodo applica un MAKEUP GAIN
 * IMPLICITO che vale ~0,57 dB per ogni dB di soglia e che si somma a TUTTO il
 * segnale, anche a -60 dBFS dove non comprime niente. Non è quindi mai
 * "trasparente": va compensato a mano, ed è il compito di LIMITER_TRIM_DB.
 *
 * Con questi valori, misurati: differenza 0,00 dB da -60 a -3 dBFS (il
 * programma normale non viene toccato), tetto a -2,75 dBFS su segnale a fondo
 * scala e mai sopra -1,20 dBFS nemmeno con 24 dB di sovraccarico.
 */
const LIMITER_THRESHOLD_DB = -3;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_S = 0.002;
const LIMITER_RELEASE_S = 0.1;
/** Compensazione esatta del makeup gain implicito misurato alla soglia qui sopra. */
const LIMITER_TRIM_DB = -1.71;

const dbToMul = (db: number) => Math.pow(10, db / 20);
/** Quanto il "musica assente" aspetta prima di allarmare (pause tra i brani). */
const MUSIC_GRACE_MS = 4000;

/**
 * Sorgente del worklet. Vive come stringa e viene caricata da un blob URL:
 * un file .js separato non è caricabile come modulo da file:// in produzione
 * (origine opaca), il blob eredita invece l'origine del documento.
 * Per questo la CSP in index.html ammette `blob:` in script-src.
 */
const PCM_SINK_WORKLET = `
class PcmSink extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.frames = options.processorOptions.chunkFrames;
        this.buf = new Int16Array(this.frames * 2);
        this.n = 0;
    }
    process(inputs) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;
        const l = input[0];
        const r = input.length > 1 ? input[1] : input[0];
        for (let i = 0; i < l.length; i++) {
            let sl = l[i]; if (sl > 1) sl = 1; else if (sl < -1) sl = -1;
            let sr = r[i]; if (sr > 1) sr = 1; else if (sr < -1) sr = -1;
            this.buf[this.n++] = sl * 32767;
            this.buf[this.n++] = sr * 32767;
            if (this.n >= this.buf.length) {
                const full = this.buf;
                this.port.postMessage(full, [full.buffer]);
                this.buf = new Int16Array(this.frames * 2);
                this.n = 0;
            }
        }
        return true;
    }
}
registerProcessor('pcm-sink', PcmSink);
`;

const pctToMul = (raw: string) => {
    const pct = parseInt(raw, 10);
    return Number.isFinite(pct) ? Math.max(0, Math.min(200, pct)) / 100 : 1;
};

interface MixEngineOptions {
    enabled: boolean;
    /** Nome dshow del microfono scelto in Configurazione. */
    micDeviceName: string;
    /** Le stesse lancette guidate dal visualizer: in MIX MODE mostrano il post-mix. */
    needles: NeedleRefs;
}

export const useMixEngine = ({ enabled, micDeviceName, needles }: MixEngineOptions) => {
    const { leftRef, rightRef } = needles;

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        let ctx: AudioContext | null = null;
        let micStream: MediaStream | null = null;
        let systemStream: MediaStream | null = null;
        let rafId: number | null = null;
        let musicTimer: ReturnType<typeof setInterval> | null = null;
        let unsubscribeGains: (() => void) | null = null;
        let workletUrl: string | null = null;

        const { appendLog, setErrorMessage, setMusicDetected } = useStore.getState();

        const fail = (message: string) => {
            appendLog({ level: 'error', source: 'system', message: `MIX MODE: ${message}` });
            setErrorMessage(`MIX MODE non attiva — ${message}`);
        };

        const start = async () => {
            // 1) AUDIO DI SISTEMA. La traccia video esiste solo perché
            // getDisplayMedia la pretende: la fermiamo subito, così Windows non
            // cattura davvero nessuno schermo.
            //
            // I tre vincoli non sono decorativi. Con `audio: true` e basta,
            // Chromium applica alla cattura il suo trattamento da videochiamata,
            // AGC compreso: il sottofondo musicale — materiale piatto, senza
            // dinamica propria — veniva inseguito e gonfiato fino a coprire la
            // voce. E siccome l'AGC agisce a monte di `musicGain`, abbassare il
            // cursore della musica non serviva a niente: il livello si rialzava.
            systemStream = await navigator.mediaDevices.getDisplayMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
                video: true,
            });
            systemStream.getVideoTracks().forEach((t) => {
                systemStream?.removeTrack(t);
                t.stop();
            });
            if (cancelled) return;
            const systemTrack = systemStream.getAudioTracks()[0];
            if (!systemTrack) {
                throw new Error('Windows non ha fornito l\'audio di sistema');
            }

            // Un vincolo su getDisplayMedia può essere ignorato senza che nessuno
            // se ne lamenti: dipende da Chromium e dal driver. Questa riga è
            // l'unico modo di sapere, leggendo il log di una diretta vera, se
            // sulla macchina della DJ l'AGC è davvero spento.
            const sys = systemTrack.getSettings();
            const flag = (v: boolean | undefined) =>
                v === undefined ? 'non riportato' : v ? 'ACCESO' : 'spento';
            appendLog({
                level: 'info',
                source: 'system',
                message: `MIX MODE: audio di sistema — AGC ${flag(sys.autoGainControl)}, `
                    + `eco ${flag(sys.echoCancellation)}, rumore ${flag(sys.noiseSuppression)}, `
                    + `${sys.sampleRate ?? '?'} Hz, ${sys.channelCount ?? '?'} canali`,
            });
            if (sys.autoGainControl) {
                appendLog({
                    level: 'error',
                    source: 'system',
                    message: 'MIX MODE: Windows non ha accettato di spegnere il controllo '
                        + 'automatico del guadagno sull\'audio di sistema. Il sottofondo può '
                        + 'alzarsi e abbassarsi da solo in onda.',
                });
            }

            // 2) MICROFONO. I tre processori di Chrome vanno spenti: sono pensati
            // per le videochiamate. L'AGC in particolare pomperebbe il respiro nei
            // silenzi e schiaccerebbe la voce sui picchi — in radio è inaccettabile.
            const micId = await resolveInputDeviceId(micDeviceName);
            if (cancelled) return;
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    ...(micId ? { deviceId: { exact: micId } } : {}),
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            });
            if (cancelled) return;

            ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
            if (ctx.state === 'suspended') await ctx.resume();
            if (cancelled) return;

            // 3) IL BANCO DI MISSAGGIO. `explicit`/2 canali fa sì che un microfono
            // mono finisca su entrambi i canali invece che solo a sinistra.
            const bus = ctx.createGain();
            bus.channelCount = 2;
            bus.channelCountMode = 'explicit';
            bus.channelInterpretation = 'speakers';

            const micGain = ctx.createGain();
            const musicGain = ctx.createGain();
            const initial = useStore.getState();
            micGain.gain.value = pctToMul(initial.streamConfig.inputGain);
            musicGain.gain.value = pctToMul(initial.musicGain);

            ctx.createMediaStreamSource(micStream).connect(micGain).connect(bus);
            ctx.createMediaStreamSource(systemStream).connect(musicGain).connect(bus);

            // I due cursori agiscono in diretta. setTargetAtTime invece di
            // un'assegnazione secca: un salto di guadagno a campione si sente
            // come un click in onda.
            let lastMic = micGain.gain.value;
            let lastMusic = musicGain.gain.value;
            unsubscribeGains = useStore.subscribe((state) => {
                if (!ctx) return;
                const nextMic = pctToMul(state.streamConfig.inputGain);
                const nextMusic = pctToMul(state.musicGain);
                // Lo store notifica ogni cambiamento (log inclusi): tocchiamo i
                // guadagni solo quando sono davvero i cursori a muoversi.
                if (nextMic === lastMic && nextMusic === lastMusic) return;
                lastMic = nextMic;
                lastMusic = nextMusic;
                const now = ctx.currentTime;
                micGain.gain.setTargetAtTime(nextMic, now, 0.02);
                musicGain.gain.setTargetAtTime(nextMusic, now, 0.02);
            });

            // 4) LIMITATORE. Ultimo anello prima dell'uscita: quello che passa di
            // qui è quello che va in onda, quindi il tetto vale su qualunque
            // combinazione dei due cursori.
            const limiter = ctx.createDynamicsCompressor();
            limiter.threshold.value = LIMITER_THRESHOLD_DB;
            limiter.ratio.value = LIMITER_RATIO;
            limiter.knee.value = 0;
            limiter.attack.value = LIMITER_ATTACK_S;
            limiter.release.value = LIMITER_RELEASE_S;

            // Annulla il makeup gain implicito di Chromium: senza questo, un
            // segnale a -30 dBFS uscirebbe a -28,3 dBFS pur senza compressione.
            const limiterTrim = ctx.createGain();
            limiterTrim.gain.value = dbToMul(LIMITER_TRIM_DB);

            const out = bus.connect(limiter).connect(limiterTrim);

            // 5) USCITA verso FFmpeg.
            workletUrl = URL.createObjectURL(new Blob([PCM_SINK_WORKLET], { type: 'application/javascript' }));
            await ctx.audioWorklet.addModule(workletUrl);
            if (cancelled) return;

            const sink = new AudioWorkletNode(ctx, 'pcm-sink', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [1],
                channelCount: 2,
                channelCountMode: 'explicit',
                channelInterpretation: 'speakers',
                processorOptions: { chunkFrames: CHUNK_FRAMES },
            });
            sink.port.onmessage = (event: MessageEvent<Int16Array>) => {
                const pcm = event.data;
                window.electronAPI?.sendMixAudio(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
            };
            out.connect(sink);

            // Il worklet gira solo se è collegato all'uscita: il gain a zero lo
            // tiene vivo senza che una singola goccia di audio arrivi alle casse
            // (e quindi al loopback, che la rimanderebbe dentro all'infinito).
            const silentOut = ctx.createGain();
            silentOut.gain.value = 0;
            sink.connect(silentOut).connect(ctx.destination);

            // 6) VU post-mix: le lancette mostrano quello che va davvero in onda,
            // limitatore compreso — è lo stesso punto da cui parte il PCM.
            const splitter = ctx.createChannelSplitter(2);
            out.connect(splitter);
            const analyserL = ctx.createAnalyser();
            const analyserR = ctx.createAnalyser();
            analyserL.fftSize = 256;
            analyserR.fftSize = 256;
            splitter.connect(analyserL, 0);
            splitter.connect(analyserR, 1);
            const bufL = new Uint8Array(analyserL.frequencyBinCount);
            const bufR = new Uint8Array(analyserR.frequencyBinCount);

            const animate = () => {
                if (cancelled) return;
                setNeedle(leftRef, readLevel(analyserL, bufL));
                setNeedle(rightRef, readLevel(analyserR, bufR));
                rafId = requestAnimationFrame(animate);
            };
            animate();

            // 7) SPIA MUSICA. Il caso che deve intercettare: RRLMP che suona su
            // un'uscita diversa da quella predefinita di Windows. La DJ sente la
            // musica in cuffia e in onda va il silenzio, senza un solo errore da
            // nessuna parte. Su setInterval e non su rAF: deve continuare a
            // funzionare anche con la finestra ridotta a icona.
            const musicAnalyser = ctx.createAnalyser();
            musicAnalyser.fftSize = 256;
            musicGain.connect(musicAnalyser);
            const musicBuf = new Uint8Array(musicAnalyser.frequencyBinCount);
            let lastSoundAt = performance.now();
            let lastReported: boolean | null = null;

            musicTimer = setInterval(() => {
                musicAnalyser.getByteFrequencyData(musicBuf);
                let peak = 0;
                for (let i = 0; i < musicBuf.length; i++) if (musicBuf[i] > peak) peak = musicBuf[i];

                const now = performance.now();
                if (peak > MUSIC_SILENCE_THRESHOLD) lastSoundAt = now;
                const detected = now - lastSoundAt < MUSIC_GRACE_MS;
                if (detected !== lastReported) {
                    lastReported = detected;
                    setMusicDetected(detected);
                }
            }, 250);

            appendLog({
                level: 'success',
                source: 'system',
                message: 'MIX MODE attiva — microfono + audio di sistema mixati in uscita',
            });
        };

        start().catch((err: unknown) => {
            if (cancelled) return;
            const reason = err instanceof Error ? err.message : String(err);
            fail(reason);
        });

        return () => {
            cancelled = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
            if (musicTimer !== null) clearInterval(musicTimer);
            unsubscribeGains?.();
            micStream?.getTracks().forEach((t) => t.stop());
            systemStream?.getTracks().forEach((t) => t.stop());
            if (workletUrl) URL.revokeObjectURL(workletUrl);
            ctx?.close().catch(() => { /* già chiuso */ });
            ctx = null;
            setNeedle(leftRef, 0);
            setNeedle(rightRef, 0);
            useStore.getState().setMusicDetected(false);
        };
    }, [enabled, micDeviceName, leftRef, rightRef]);
};
