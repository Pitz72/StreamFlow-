import { useEffect, useState } from 'react'
import Timer from './components/Timer'
import VuMeter from './components/VuMeter'
import OnAirButton from './components/OnAirButton'
import SettingsPanel from './components/SettingsPanel'
import NowPlayingPanel from './components/NowPlayingPanel'
import CoverArtPanel from './components/CoverArtPanel'
import Modal from './components/Modal'
import StreamLog from './components/StreamLog'
import { useStore } from './store/useStore'

type OpenModal = null | 'settings' | 'nowplaying' | 'coverart';

const statusLabels: Record<string, string> = {
    disconnected: 'Ready',
    connecting: 'Connecting...',
    connected: 'ON AIR',
    error: 'Error',
};

const statusColors: Record<string, string> = {
    disconnected: 'bg-stone-600',
    connecting: 'bg-yellow-500 animate-pulse',
    connected: 'bg-red-500 animate-pulse',
    error: 'bg-orange-500',
};

const statusTextColors: Record<string, string> = {
    disconnected: 'text-stone-400',
    connecting: 'text-yellow-400',
    connected: 'text-red-400',
    error: 'text-orange-400',
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

    // Listen for status updates from Main process
    useEffect(() => {
        if (window.electronAPI && window.electronAPI.onStreamStatus) {
            const unsubscribe = window.electronAPI.onStreamStatus((status, message) => {
                setStreamStatus(status);

                if (status === 'connected') {
                    setIsStreaming(true);
                    // Auto-send metadata as soon as the stream is confirmed live
                    if (window.electronAPI && (streamMetadata.artist || streamMetadata.title)) {
                        window.electronAPI.updateMetadata({
                            artist: streamMetadata.artist,
                            title: streamMetadata.title,
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
    }, [setIsStreaming, setStreamStatus, setErrorMessage, streamMetadata]);

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

    const toggleStream = () => {
        if (window.electronAPI) {
            if (!isStreaming) {
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

                const startConfig = {
                    ...streamConfig,
                    inputDeviceName: selectedDeviceLabel
                };

                window.electronAPI.startStream(startConfig);
            } else {
                window.electronAPI.stopStream();
            }
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
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setOpenModal('nowplaying')} className={toolbarBtn}>
                        Now Playing
                    </button>
                    <button onClick={() => setOpenModal('coverart')} className={toolbarBtn}>
                        Cover Art
                    </button>
                    <button onClick={() => setOpenModal('settings')} className={toolbarBtn}>
                        Configurazione
                    </button>
                    <span className="text-stone-600 text-xs ml-3">v0.5.3</span>
                </div>
            </header>

            {/* Central control panel */}
            <main className="flex-1 flex flex-col items-center justify-center gap-12 p-8 overflow-hidden">
                <Timer isRunning={isStreaming} />

                <div className="flex items-center gap-16 justify-center">
                    <VuMeter label="L" active={isStreaming} />
                    <OnAirButton
                        isOn={isStreaming}
                        onClick={toggleStream}
                        disabled={streamStatus === 'connecting'}
                    />
                    <VuMeter label="R" active={isStreaming} />
                </div>
            </main>

            {/* Log bar (always visible at bottom, expandable) */}
            <StreamLog />

            {/* Modals */}
            <Modal isOpen={openModal === 'settings'} onClose={() => setOpenModal(null)} title="Configurazione" maxWidth="max-w-lg">
                <SettingsPanel />
            </Modal>

            <Modal isOpen={openModal === 'nowplaying'} onClose={() => setOpenModal(null)} title="Now Playing / Metadata" maxWidth="max-w-2xl">
                <NowPlayingPanel />
            </Modal>

            <Modal isOpen={openModal === 'coverart'} onClose={() => setOpenModal(null)} title="Cover Art — AzuraCast" maxWidth="max-w-md">
                <CoverArtPanel />
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
