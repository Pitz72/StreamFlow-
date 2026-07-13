import { useEffect, useRef, useState } from 'react'
import Timer from './components/Timer'
import VuMeter from './components/VuMeter'
import { useAudioVisualizer } from './hooks/useAudioVisualizer'
import OnAirButton from './components/OnAirButton'
import InputVolumeControl from './components/InputVolumeControl'
import SettingsPanel from './components/SettingsPanel'
import NowPlayingPanel from './components/NowPlayingPanel'
import Modal from './components/Modal'
import StreamLog from './components/StreamLog'
import { useStore } from './store/useStore'

type OpenModal = null | 'settings' | 'nowplaying';

const statusLabels: Record<string, string> = {
    disconnected: 'Ready',
    connecting: 'Connecting...',
    connected: 'ON AIR',
    error: 'Error',
    reconnecting: 'Reconnecting...',
};

const statusColors: Record<string, string> = {
    disconnected: 'bg-stone-600',
    connecting: 'bg-yellow-500 animate-pulse',
    connected: 'bg-red-500 animate-pulse',
    error: 'bg-orange-500',
    reconnecting: 'bg-amber-500 animate-pulse',
};

const statusTextColors: Record<string, string> = {
    disconnected: 'text-stone-400',
    connecting: 'text-yellow-400',
    connected: 'text-red-400',
    error: 'text-orange-400',
    reconnecting: 'text-amber-400',
};

function App() {
    const {
        streamConfig,
        streamMetadata,
        selectedDeviceId,
        selectedDeviceLabel,
        isStreaming,
        streamStatus,
        setIsStreaming,
        setStreamStatus,
        errorMessage,
        setErrorMessage,
        appendLog,
    } = useStore()

    const [openModal, setOpenModal] = useState<OpenModal>(null);
    // Dettaglio mostrato accanto allo status (countdown riconnessione dal main)
    const [statusDetail, setStatusDetail] = useState<string | null>(null);

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

    // Il microfono per i VU meter è attivo solo quando la finestra è visibile:
    // niente capture (e indicatore privacy OS) con app minimizzata.
    const [pageVisible, setPageVisible] = useState(!document.hidden);
    useEffect(() => {
        const handler = () => setPageVisible(!document.hidden);
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);

    // Pipeline audio condivisa: livelli L/R reali per entrambi i VU meter
    const { left: vuLeft, right: vuRight } = useAudioVisualizer(selectedDeviceId, pageVisible);

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

    // Auto-dismiss toast after 5 seconds
    useEffect(() => {
        if (errorMessage) {
            const timer = setTimeout(() => setErrorMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [errorMessage, setErrorMessage]);

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
                inputDeviceName: selectedDeviceLabel
            });
            // Il flag viene rilasciato dal primo status IPC in arrivo;
            // fallback di sicurezza se il main non risponde.
            setTimeout(() => { startInFlightRef.current = false; }, 3000);
        } catch {
            startInFlightRef.current = false;
            setErrorMessage('Errore di comunicazione con il processo principale.');
        }
    }

    const toolbarBtn = "px-4 py-2 rounded-lg text-sm font-medium border border-stone-700 bg-stone-800/60 hover:bg-stone-700 hover:border-stone-600 text-stone-300 hover:text-white transition-colors";

    return (
        <div className="flex flex-col h-screen w-screen bg-stone-950 text-white overflow-hidden font-sans">
            {/* Header */}
            <header className="flex justify-between items-center bg-stone-900/50 px-6 py-4 border-b border-stone-800 shrink-0">
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${statusColors[streamStatus] || 'bg-stone-600'}`}></div>
                    <span className="text-xl font-bold tracking-wider text-stone-300">RUNTIME STREAMFLOW</span>
                    <span className={`text-xs font-mono uppercase tracking-wider ml-2 ${statusTextColors[streamStatus] || 'text-stone-400'}`}>
                        {statusLabels[streamStatus] || 'Unknown'}
                    </span>
                    {statusDetail && (
                        <span className="text-xs font-mono text-amber-400 ml-1">
                            {statusDetail}
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
                    <span className="text-stone-600 text-xs ml-3">v{__APP_VERSION__}</span>
                </div>
            </header>

            {/* Central control panel */}
            <main className="flex-1 flex flex-col items-center justify-center gap-12 p-8 overflow-hidden">
                <Timer isRunning={isStreaming} />

                <div className="flex items-center gap-16 justify-center">
                    <VuMeter label="L" active={isStreaming} volume={vuLeft} />
                    <OnAirButton
                        isOn={sessionActive}
                        onClick={toggleStream}
                        disabled={streamStatus === 'connecting'}
                    />
                    <VuMeter label="R" active={isStreaming} volume={vuRight} />
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
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-bounce">
                    <div className="bg-red-900/90 border border-red-700 text-red-200 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-lg">
                        <span className="text-red-400 text-lg">⚠</span>
                        <span className="text-sm font-medium">{errorMessage}</span>
                        <button
                            onClick={() => setErrorMessage(null)}
                            className="text-red-400 hover:text-red-200 font-bold ml-2"
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
