import { useEffect, useRef, useState } from 'react'
import Timer from './components/Timer'
import LevelMeter from './components/LevelMeter'
import { useAudioVisualizer } from './hooks/useAudioVisualizer'
import { useMixEngine } from './hooks/useMixEngine'
import OnAirButton from './components/OnAirButton'
import InputVolumeControl from './components/InputVolumeControl'
import SettingsPanel from './components/SettingsPanel'
import NowPlayingPanel from './components/NowPlayingPanel'
import Modal from './components/Modal'
import StreamLog from './components/StreamLog'
import PresentazioneContinua from './components/PresentazioneContinua'
import UpdateDialog from './components/UpdateDialog'
import { useStore } from './store/useStore'
import { STATION_PRESET } from './config/stationPreset'

type OpenModal = null | 'settings' | 'nowplaying';

// Parola di stato sopra il timer: dice cosa sta succedendo, in italiano e in
// grande. Il colore ripete l'informazione, non la porta da solo.
const statusWord: Record<string, { text: string; cls: string }> = {
    disconnected: { text: 'Pronto', cls: 'text-sf-green' },
    connecting: { text: 'Collegamento in corso', cls: 'text-sf-amberInk' },
    connected: { text: 'In onda', cls: 'text-sf-redInk' },
    error: { text: 'Fermo per errore', cls: 'text-sf-redInk' },
    reconnecting: { text: 'Riconnessione', cls: 'text-sf-amberInk' },
};
const statusPulses = (s: string) => s === 'connecting' || s === 'connected' || s === 'reconnecting';

const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
    </svg>
);
const ICON_MUSIC = 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z';
const ICON_SETTINGS = 'M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1 M15 4v4 M9 10v4 M17 16v4';
const ICON_DOWNLOAD = 'M12 3v12 M7 10l5 5 5-5 M5 21h14';
const ICON_ALERT = 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z';
const ICON_CLOSE = 'M6 6l12 12 M18 6 6 18';

function App() {
    const {
        streamConfig,
        setStreamConfig,
        streamMetadata,
        selectedDeviceId,
        selectedDeviceLabel,
        isStreaming,
        streamStatus,
        setIsStreaming,
        setStreamStatus,
        errorMessage,
        setErrorMessage,
        rememberPassword,
        recordLocal,
        mixMode,
        mixReady,
        musicDetected,
        musicGain,
        appendLog,
    } = useStore()

    const [openModal, setOpenModal] = useState<OpenModal>(null);
    // Dettaglio mostrato accanto allo status (countdown riconnessione dal main)
    const [statusDetail, setStatusDetail] = useState<string | null>(null);

    // Solo tema scuro dalla 0.10 (decisione di Simone, 29/10/2026). La scelta
    // salvata dalle versioni precedenti non serve più: la si toglie.
    useEffect(() => {
        try { localStorage.removeItem('streamflow-theme'); } catch { /* storage non disponibile */ }
    }, []);

    // Aggiornamento automatico: il main scarica in sottofondo e avvisa quando è
    // pronto. A quel punto si apre una finestra che chiede se installare subito
    // (mai durante la diretta); se si sceglie "Più tardi" si installa alla chiusura.
    const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });
    // Versione per cui si è già scelto "Più tardi": la finestra non torna da sola,
    // resta il pulsante nell'intestazione per riaprirla.
    const [updateDeferred, setUpdateDeferred] = useState<string | null>(null);
    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onUpdateStatus) return;
        void api.getUpdateStatus().then(setUpdate).catch(() => {});
        return api.onUpdateStatus(setUpdate);
    }, []);

    // Guard sincrono anti doppio-GO: il disabled del pulsante arriva solo quando
    // lo status 'connecting' torna dal main via IPC — nel frattempo un secondo
    // click avvierebbe un secondo stream.
    const startInFlightRef = useRef(false);

    // Ref sui metadata correnti: evita di ri-sottoscrivere il listener IPC
    // a ogni keystroke nei campi Artist/Title.
    const metadataRef = useRef(streamMetadata);
    useEffect(() => {
        metadataRef.current = streamMetadata;
    }, [streamMetadata]);

    // Ref sulle credenziali correnti: il listener IPC salva la password (cifrata,
    // via safeStorage nel main) solo DOPO una connessione riuscita — così non
    // memorizziamo mai una password sbagliata.
    const credsRef = useRef({ username: '', password: '', remember: true });
    useEffect(() => {
        credsRef.current = {
            username: streamConfig.icecastUser,
            password: streamConfig.password,
            remember: rememberPassword,
        };
    }, [streamConfig.icecastUser, streamConfig.password, rememberPassword]);

    // Le credenziali con cui la sessione è PARTITA. Sono queste, e non quelle
    // del modulo, ad aver superato la prova del server: se durante una diretta o
    // una riconnessione il DJ cambia utente o password in Configurazione, il
    // 'connected' successivo salvava come verificata una password mai provata,
    // magari sotto il nome di un altro DJ.
    const sessionCredsRef = useRef<{ username: string; password: string } | null>(null);

    // All'avvio: se "ricorda password" è attivo, precompila la password salvata
    // per l'utente selezionato (l'utente apre l'app e preme solo GO).
    useEffect(() => {
        const { username, password, remember } = credsRef.current;
        if (!remember || !username || password) return;
        if (!window.electronAPI?.loadDjPassword) return;
        window.electronAPI.loadDjPassword({ username })
            .then(({ password: saved }) => {
                if (saved) setStreamConfig({ password: saved });
            })
            .catch(() => { /* nessuna password salvata */ });
        // Solo al mount: i cambi utente successivi sono gestiti dal SettingsPanel.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Il microfono per i VU meter è attivo solo quando la finestra è visibile:
    // niente capture (e indicatore privacy OS) con app minimizzata.
    const [pageVisible, setPageVisible] = useState(!document.hidden);
    useEffect(() => {
        const handler = () => setPageVisible(!document.hidden);
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);

    // Pipeline audio condivisa: le barre L/R sono guidate via ref direttamente
    // dal loop rAF (nessun re-render React per frame).
    //
    // Le due pipeline si escludono a vicenda e comandano le STESSE barre:
    // in MIX MODE il mixer resta acceso anche a finestra ridotta (è la sorgente
    // della diretta, non solo un indicatore) e i VU mostrano il livello post-mix.
    const { leftRef: levelLeftRef, rightRef: levelRightRef } = useAudioVisualizer(
        selectedDeviceId,
        pageVisible && !mixMode,
    );
    useMixEngine({
        enabled: mixMode,
        micDeviceName: selectedDeviceId,
        levels: { leftRef: levelLeftRef, rightRef: levelRightRef },
    });

    // Listen for status updates from Main process
    useEffect(() => {
        if (window.electronAPI && window.electronAPI.onStreamStatus) {
            const unsubscribe = window.electronAPI.onStreamStatus((status, message) => {
                startInFlightRef.current = false;
                setStreamStatus(status);
                setStatusDetail(status === 'reconnecting' ? (message || null) : null);

                if (status === 'reconnecting') {
                    setIsStreaming(false);
                } else if (status === 'connected') {
                    setIsStreaming(true);
                    // Auto-send metadata as soon as the stream is confirmed live
                    const meta = metadataRef.current;
                    if (window.electronAPI && (meta.artist || meta.title)) {
                        window.electronAPI.updateMetadata({
                            artist: meta.artist,
                            title: meta.title,
                        });
                    }
                    // Connessione riuscita → la password è giusta: memorizzala (cifrata).
                    const creds = sessionCredsRef.current;
                    if (credsRef.current.remember && creds?.username && creds.password && window.electronAPI?.saveDjPassword) {
                        void window.electronAPI.saveDjPassword({
                            username: creds.username,
                            password: creds.password,
                        });
                    }
                } else if (status === 'disconnected' || status === 'error') {
                    setIsStreaming(false);
                    if (status === 'error' && message) {
                        setErrorMessage(message);
                    }
                }
            });
            return unsubscribe;
        }
    }, [setIsStreaming, setStreamStatus, setErrorMessage]);

    // Riallineamento dopo un ricaricamento (crash dell'interfaccia): la diretta
    // può essere ancora viva nel main. Solo lo stato, senza gli effetti del
    // 'connected' normale (metadati re-inviati, password salvata).
    useEffect(() => {
        if (!window.electronAPI?.getStreamStatus) return;
        window.electronAPI.getStreamStatus()
            .then(({ status, message }) => {
                // Un 'error' residuo non va riproposto: il toast è già stato visto.
                if (status === 'disconnected' || status === 'error') return;
                setStreamStatus(status);
                setStatusDetail(status === 'reconnecting' ? (message || null) : null);
                setIsStreaming(status === 'connected');
            })
            .catch(() => { /* main non raggiungibile: resta lo stato iniziale */ });
    }, [setIsStreaming, setStreamStatus]);

    // Subscribe to log events from main process
    useEffect(() => {
        if (window.electronAPI && window.electronAPI.onLogEvent) {
            const unsubscribe = window.electronAPI.onLogEvent((e) => {
                appendLog(e);
            });
            return unsubscribe;
        }
    }, [appendLog]);

    // Il toast NON si autocancella più: spariva dopo 5s portandosi via l'unica
    // spiegazione dell'errore di connessione (il pannello Log non la riceveva).
    // Ora resta finché non la si chiude con la ✕, e l'errore è comunque
    // ricostruibile dal pannello Log e dal file di log.

    // Durante la riconnessione automatica la sessione è "attiva": il pulsante
    // funziona da annulla-riconnessione (chiama stopStream).
    const sessionActive = isStreaming || streamStatus === 'reconnecting';

    // L'avviso di aggiornamento non si apre mai sopra una diretta, un collegamento
    // in corso o un'altra finestra: aspetta che il DJ abbia finito.
    const updateReady = update.state === 'ready' ? update.version : null;
    const showUpdateDialog = updateReady !== null
        && updateDeferred !== updateReady
        && !sessionActive
        && streamStatus !== 'connecting'
        && openModal === null;

    const toggleStream = async () => {
        if (!window.electronAPI) return;

        if (sessionActive) {
            window.electronAPI.stopStream();
            return;
        }

        if (startInFlightRef.current) return;

        if (selectedDeviceId === 'default' || !selectedDeviceLabel || selectedDeviceLabel === 'default') {
            setErrorMessage('Seleziona un Audio Input Device specifico in Configurazione.');
            setOpenModal('settings');
            return;
        }
        if (!streamConfig.host.trim()) {
            setErrorMessage('Host obbligatorio.');
            setOpenModal('settings');
            return;
        }
        if (!streamConfig.icecastUser.trim()) {
            setErrorMessage('Scegli il tuo nome utente in Configurazione.');
            setOpenModal('settings');
            return;
        }
        const portNum = parseInt(streamConfig.port, 10);
        if (!streamConfig.port.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) {
            setErrorMessage('La porta deve essere un numero tra 1 e 65535.');
            setOpenModal('settings');
            return;
        }
        if (!streamConfig.password.trim()) {
            setErrorMessage('Password obbligatoria.');
            setOpenModal('settings');
            return;
        }
        // MIX MODE: senza PCM dal mixer FFmpeg resterebbe in attesa e in onda non
        // andrebbe niente. Il main ha la sua rete di sicurezza, ma fermarsi qui
        // evita perfino di aprire la connessione.
        if (mixMode && !mixReady) {
            setErrorMessage('MIX MODE non pronta: il mixer non sta producendo audio. Controlla microfono e audio di sistema nel pannello Log, poi riprova.');
            return;
        }

        startInFlightRef.current = true;
        try {
            // Il device salvato in localStorage può essere stato scollegato:
            // meglio un messaggio chiaro ora che un errore dshow criptico da FFmpeg.
            const available = await window.electronAPI.getAudioDevices();
            if (available.length > 0 && !available.includes(selectedDeviceLabel)) {
                setErrorMessage(`Il dispositivo "${selectedDeviceLabel}" non è più disponibile. Selezionane un altro.`);
                setOpenModal('settings');
                startInFlightRef.current = false;
                return;
            }

            sessionCredsRef.current = {
                username: streamConfig.icecastUser,
                password: streamConfig.password,
            };
            window.electronAPI.startStream({
                ...streamConfig,
                inputDeviceName: selectedDeviceLabel,
                recordLocal,
                mixMode,
            });
            // Il flag viene rilasciato dal primo status IPC in arrivo;
            // fallback di sicurezza se il main non risponde.
            setTimeout(() => { startInFlightRef.current = false; }, 3000);
        } catch {
            startInFlightRef.current = false;
            setErrorMessage('Errore di comunicazione con il processo principale.');
        }
    }

    const dj = STATION_PRESET.djs.find((d) => d.username === streamConfig.icecastUser);
    const djName = dj?.displayName || streamConfig.icecastUser || 'Scegli il tuo studio in Configurazione';
    const word = statusWord[streamStatus] || statusWord.disconnected;
    const nowPlaying = [streamMetadata.artist, streamMetadata.title].filter(Boolean).join(' · ');

    return (
        <div className="flex flex-col h-screen w-screen bg-sf-bg text-sf-ink overflow-hidden font-sans">
            {/* Rimedio allo sfarfallio da Fast Sync — strato invisibile agganciato
                a document.body, sempre attivo, senza interruttore. NON è un
                effetto e non è codice morto: leggere il commento in testa a
                PresentazioneContinua.tsx prima di toccarlo. */}
            <PresentazioneContinua />

            <header className="h-[76px] shrink-0 flex items-center gap-4 px-7">
                <div className="w-11 h-11 rounded-xl bg-sf-greenDeep border border-sf-green/40 flex items-center justify-center shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" fill="none" stroke="rgb(var(--sf-green))" strokeWidth="2" />
                        <circle cx="12" cy="12" r="4.5" fill="#E5483A" />
                    </svg>
                </div>
                <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-[18px] font-extrabold truncate">{djName}</span>
                    <span className="text-[13px] text-sf-inkDim">
                        StreamFlow · v{__APP_VERSION__}{__APP_EDITION__ ? ` ${__APP_EDITION__}` : ''}
                    </span>
                </div>
                <div className="flex-1" />
                {updateReady && (
                    <button
                        type="button"
                        onClick={() => setUpdateDeferred(null)}
                        disabled={sessionActive || streamStatus === 'connecting'}
                        title={sessionActive
                            ? `La versione ${updateReady} si installa quando chiudi StreamFlow, a diretta finita.`
                            : `La versione ${updateReady} è pronta: apri l'avviso per installarla.`}
                        className="sf-btn border-sf-green text-sf-green"
                    >
                        <Icon d={ICON_DOWNLOAD} />
                        Aggiorna a v{updateReady}
                    </button>
                )}
                <button type="button" onClick={() => setOpenModal('nowplaying')} className="sf-btn">
                    <Icon d={ICON_MUSIC} />
                    Now Playing
                </button>
                <button type="button" onClick={() => setOpenModal('settings')} className="sf-btn">
                    <Icon d={ICON_SETTINGS} />
                    Configurazione
                </button>
            </header>

            <main className="flex-1 min-h-0 flex flex-col items-center justify-center gap-[clamp(14px,3vh,26px)] px-16">
                <div className={`flex items-center gap-3 text-[26px] font-black uppercase tracking-[0.22em] ${word.cls}`} aria-live="polite">
                    <span
                        className={`w-3.5 h-3.5 rounded-full bg-current ${statusPulses(streamStatus) ? 'animate-pulse' : ''}`}
                        aria-hidden="true"
                    />
                    <span>{word.text}</span>
                    {statusDetail && (
                        <span className="text-[18px] font-bold normal-case tracking-normal">· {statusDetail}</span>
                    )}
                </div>

                <Timer isRunning={isStreaming} />

                <span className={`text-[clamp(18px,3vh,26px)] font-semibold text-center max-w-full truncate ${nowPlaying ? 'text-sf-inkSoft' : 'text-sf-inkFaint'}`}>
                    {nowPlaying || 'Nessun titolo per il player: impostalo in Now Playing'}
                </span>

                <div className="w-full max-w-[900px] flex flex-col gap-2.5">
                    <LevelMeter label="L" active={isStreaming || mixMode} coverRef={levelLeftRef} />
                    <LevelMeter label="R" active={isStreaming || mixMode} coverRef={levelRightRef} />
                </div>

                <div className="w-full max-w-[900px]">
                    <OnAirButton
                        isOn={sessionActive}
                        onClick={toggleStream}
                        disabled={streamStatus === 'connecting'}
                        status={streamStatus}
                    />
                </div>
            </main>

            {/* Controlli sempre a portata durante la diretta: volume microfono e spie. */}
            <div className="shrink-0 flex items-center gap-3 flex-wrap px-7 pt-2 pb-4">
                <InputVolumeControl />
                {/* MIX MODE: la spia diventa rossa quando dall'audio di sistema non
                    arriva niente — il caso in cui la musica si sente in cuffia ma in
                    onda va il silenzio (player su un'uscita diversa da quella di
                    Windows). Senza questa spia sarebbe un guasto invisibile. */}
                {mixMode && (
                    <span
                        className={`h-14 flex items-center gap-2 px-5 rounded-2xl border text-[15px] font-bold ${musicDetected ? 'bg-sf-surface border-sf-lineStrong text-sf-ink' : 'bg-sf-onair/10 border-sf-onair text-sf-redInk'}`}
                        title={
                            musicDetected
                                ? 'Mix attivo: microfono + audio del computer'
                                : 'Mix attivo ma dal computer non arriva musica: controlla che il player suoni sul dispositivo audio predefinito di Windows'
                        }
                    >
                        {musicDetected ? (
                            <>Mix · musica <span className="font-mono text-sf-cyanInk">{parseInt(musicGain || '100', 10)} %</span></>
                        ) : (
                            <>Mix · nessuna musica dal computer</>
                        )}
                    </span>
                )}
                {recordLocal && (
                    <span
                        className={`h-14 flex items-center gap-2 px-5 rounded-2xl border text-[15px] font-bold ${sessionActive ? 'bg-sf-onair/10 border-sf-onair/60 text-sf-redInk' : 'bg-sf-surface border-sf-lineStrong text-sf-inkSoft'}`}
                        title="Una copia MP3 della diretta in Documenti\StreamFlow"
                    >
                        <span className={`w-2.5 h-2.5 rounded-full ${sessionActive ? 'bg-sf-onair' : 'bg-sf-inkFaint'}`} aria-hidden="true" />
                        {sessionActive ? 'Sto registrando' : 'Registrazione attiva'}
                    </span>
                )}
            </div>

            {/* Registro eventi (sempre visibile in basso, espandibile) */}
            <StreamLog />

            <Modal isOpen={openModal === 'settings'} onClose={() => setOpenModal(null)} title="Configurazione" maxWidth="max-w-4xl" closeOnBackdrop={false}>
                <SettingsPanel />
            </Modal>

            {updateReady && (
                <UpdateDialog
                    isOpen={showUpdateDialog}
                    version={updateReady}
                    onLater={() => setUpdateDeferred(updateReady)}
                />
            )}

            <Modal isOpen={openModal === 'nowplaying'} onClose={() => setOpenModal(null)} title="Now Playing" maxWidth="max-w-2xl">
                <NowPlayingPanel />
            </Modal>

            {/* Avviso d'errore (non bloccante): resta finché non lo si chiude. */}
            {errorMessage && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] w-[min(640px,calc(100vw-32px))]" role="alert">
                    <div className="flex items-start gap-3 rounded-2xl border border-sf-onair bg-sf-surface px-5 py-4 shadow-2xl">
                        <span className="text-sf-redInk mt-0.5 shrink-0"><Icon d={ICON_ALERT} size={22} /></span>
                        <span className="flex-1 text-[15px] leading-snug text-sf-ink">{errorMessage}</span>
                        <button
                            type="button"
                            onClick={() => setErrorMessage(null)}
                            aria-label="Chiudi l'avviso"
                            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sf-inkSoft hover:bg-sf-raised"
                        >
                            <Icon d={ICON_CLOSE} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default App
