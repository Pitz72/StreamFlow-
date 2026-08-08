import { useEffect, useRef, useState } from 'react'
import Timer from './components/Timer'
import VuMeter from './components/VuMeter'
import { useAudioVisualizer } from './hooks/useAudioVisualizer'
import { useMixEngine } from './hooks/useMixEngine'
import OnAirButton from './components/OnAirButton'
import InputVolumeControl from './components/InputVolumeControl'
import SettingsPanel from './components/SettingsPanel'
import NowPlayingPanel from './components/NowPlayingPanel'
import Modal from './components/Modal'
import StreamLog from './components/StreamLog'
import PresentazioneContinua from './components/PresentazioneContinua'
import { useStore } from './store/useStore'

type OpenModal = null | 'settings' | 'nowplaying';
type Theme = 'dark' | 'light';

const statusLabels: Record<string, string> = {
    disconnected: 'Ready',
    connecting: 'Connecting...',
    connected: 'ON AIR',
    error: 'Error',
    reconnecting: 'Reconnecting...',
};

// Colore del dot/pill di stato (identità "Deco Dial"): valori espliciti perché
// non tematizzabili (rossi/ambra restano invariati tra tema chiaro e scuro).
const statusColor: Record<string, string> = {
    disconnected: '#5A6A4A',
    connecting: '#E0B23A',
    connected: '#E0483A',
    error: '#E0742A',
    reconnecting: '#E0B23A',
};
const statusPulses = (s: string) => s === 'connecting' || s === 'connected' || s === 'reconnecting';

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
        musicDetected,
        appendLog,
    } = useStore()

    const [openModal, setOpenModal] = useState<OpenModal>(null);
    // Dettaglio mostrato accanto allo status (countdown riconnessione dal main)
    const [statusDetail, setStatusDetail] = useState<string | null>(null);

    // Tema chiaro/scuro: stato puramente presentazionale, persistito a parte
    // (NON nello store Zustand). Applica la classe .theme-light su <html>, che
    // commuta le variabili CSS del sistema Deco Dial.
    const [theme, setTheme] = useState<Theme>(() => {
        return (localStorage.getItem('streamflow-theme') as Theme) || 'dark';
    });
    useEffect(() => {
        document.documentElement.classList.toggle('theme-light', theme === 'light');
        localStorage.setItem('streamflow-theme', theme);
    }, [theme]);

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

    // Pipeline audio condivisa: le lancette L/R sono guidate via ref direttamente
    // dal loop rAF (nessun re-render React per frame).
    //
    // Le due pipeline si escludono a vicenda e comandano le STESSE lancette:
    // in MIX MODE il mixer resta acceso anche a finestra ridotta (è la sorgente
    // della diretta, non solo un indicatore) e i VU mostrano il livello post-mix.
    const { leftRef: vuLeftRef, rightRef: vuRightRef } = useAudioVisualizer(
        selectedDeviceId,
        pageVisible && !mixMode,
    );
    useMixEngine({
        enabled: mixMode,
        micDeviceName: selectedDeviceId,
        needles: { leftRef: vuLeftRef, rightRef: vuRightRef },
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
                    const creds = credsRef.current;
                    if (creds.remember && creds.username && creds.password && window.electronAPI?.saveDjPassword) {
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

    const toolbarBtn = "px-4 py-2 rounded-[2px] text-xs font-ui font-semibold uppercase tracking-[2px] border border-deco-brass/50 bg-transparent hover:bg-deco-brass/10 text-deco-brass transition-colors";

    return (
        <div className="deco-panel-bg flex flex-col h-screen w-screen text-deco-ink overflow-hidden font-ui">
            {/* Rimedio allo sfarfallio da Fast Sync — strato invisibile agganciato
                a document.body, sempre attivo, senza interruttore. NON è un
                effetto e non è codice morto: leggere il commento in testa a
                PresentazioneContinua.tsx prima di toccarlo. */}
            <PresentazioneContinua />

            {/* Header */}
            <header className="flex justify-between items-center bg-deco-bg/40 px-[30px] py-[18px] border-b border-deco-brass/35 shrink-0">
                <div className="flex items-center gap-3">
                    <div
                        className={`w-3 h-3 rounded-full ${statusPulses(streamStatus) ? 'animate-pulse' : ''}`}
                        style={{ background: statusColor[streamStatus] || '#5A6A4A' }}
                    ></div>
                    <span className="font-display text-[22px] tracking-[2px]">
                        <span className="text-deco-ink">RUNTIME</span>{' '}
                        <span className="text-deco-brass">STREAMFLOW</span>
                    </span>
                    <span
                        className="ml-2 font-mono text-[11px] uppercase px-2 py-0.5 rounded-[3px] border"
                        style={{ color: statusColor[streamStatus] || '#5A6A4A', borderColor: statusColor[streamStatus] || '#5A6A4A' }}
                    >
                        {statusLabels[streamStatus] || 'Unknown'}
                    </span>
                    {statusDetail && (
                        <span className="text-[11px] font-mono text-deco-warn ml-1">
                            {statusDetail}
                        </span>
                    )}
                    {/* MIX MODE: la spia diventa rossa quando dall'audio di sistema non
                        arriva niente — il caso in cui la musica si sente in cuffia ma in
                        onda va il silenzio (player su un'uscita diversa da quella di
                        Windows). Senza questa spia sarebbe un guasto invisibile. */}
                    {mixMode && (
                        <span
                            className="font-mono text-[11px] uppercase px-2 py-0.5 rounded-[3px] border ml-1"
                            style={{
                                color: musicDetected ? '#C8A44E' : '#E0483A',
                                borderColor: musicDetected ? '#C8A44E' : '#E0483A',
                            }}
                            title={
                                musicDetected
                                    ? 'Mix attivo: microfono + musica del computer'
                                    : 'Mix attivo ma dal computer non arriva musica: controlla che il player suoni sul dispositivo audio predefinito di Windows'
                            }
                        >
                            {musicDetected ? 'Mix' : 'Mix · no musica'}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setOpenModal('nowplaying')} className={toolbarBtn}>
                        Now Playing
                    </button>
                    <button onClick={() => setOpenModal('settings')} className={toolbarBtn}>
                        Configurazione
                    </button>
                    {/* Toggle tema chiaro/scuro (34×20 pill) */}
                    <button
                        onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                        title={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
                        className="relative w-[34px] h-[20px] rounded-full border border-deco-brass/50 transition-colors shrink-0 ml-1"
                        style={{ background: 'rgba(200,164,78,.12)' }}
                    >
                        <span
                            className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-deco-brass transition-all duration-200"
                            style={{ left: theme === 'light' ? '17px' : '2px' }}
                        ></span>
                    </button>
                    <span className="text-deco-brass/60 text-[10px] font-mono ml-2">
                        v{__APP_VERSION__} · Deborah Edition
                    </span>
                </div>
            </header>

            {/* Central control panel */}
            <main className="flex-1 flex flex-col items-center justify-center gap-[26px] px-[30px] overflow-hidden">
                <Timer isRunning={isStreaming} />

                <div className="flex items-center gap-[44px] justify-center">
                    <VuMeter label="L" active={isStreaming} barRef={vuLeftRef} />
                    <OnAirButton
                        isOn={sessionActive}
                        onClick={toggleStream}
                        disabled={streamStatus === 'connecting'}
                        status={streamStatus}
                    />
                    <VuMeter label="R" active={isStreaming} barRef={vuRightRef} />
                </div>

                <InputVolumeControl />
            </main>

            {/* Log bar (always visible at bottom, expandable) — shrink-0 garantito nel componente */}
            <StreamLog />

            {/* Modals */}
            <Modal isOpen={openModal === 'settings'} onClose={() => setOpenModal(null)} title="Configurazione" maxWidth="max-w-lg" closeOnBackdrop={false}>
                <SettingsPanel />
            </Modal>

            <Modal isOpen={openModal === 'nowplaying'} onClose={() => setOpenModal(null)} title="Now Playing / Metadata" maxWidth="max-w-2xl">
                <NowPlayingPanel />
            </Modal>

            {/* Toast Notification (non-blocking) */}
            {errorMessage && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]">
                    <div
                        className="border rounded-[10px] px-[17px] py-[13px] shadow-2xl flex items-center gap-3 max-w-lg"
                        style={{
                            background: 'linear-gradient(#3A1512, #2A0F0D)',
                            borderColor: 'rgba(224,72,58,.55)',
                        }}
                    >
                        <span className="text-deco-onair text-lg">⚠</span>
                        <span className="text-sm font-mono" style={{ color: '#F0C9C4' }}>{errorMessage}</span>
                        <button
                            onClick={() => setErrorMessage(null)}
                            className="text-deco-onair hover:opacity-80 font-bold ml-2"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default App
