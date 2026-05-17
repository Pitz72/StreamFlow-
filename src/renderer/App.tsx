import { useEffect } from 'react'
import Timer from './components/Timer'
import VuMeter from './components/VuMeter'
import OnAirButton from './components/OnAirButton'
import SettingsPanel from './components/SettingsPanel'
import NowPlayingPanel from './components/NowPlayingPanel'
import CoverArtPanel from './components/CoverArtPanel'
import { useStore } from './store/useStore'

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
        setErrorMessage
    } = useStore()

    // Listen for status updates from Main process
    useEffect(() => {
        if (window.electronAPI && window.electronAPI.onStreamStatus) {
            const unsubscribe = window.electronAPI.onStreamStatus((status, message) => {
                setStreamStatus(status);

                if (status === 'connected') {
                    setIsStreaming(true);
                    // Auto-send fixed metadata as soon as the stream is confirmed live
                    if (window.electronAPI && (streamMetadata.artist || streamMetadata.title || streamMetadata.showName)) {
                        window.electronAPI.updateMetadata({
                            artist: streamMetadata.artist || streamMetadata.showName,
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
                    setErrorMessage('Please select a specific Audio Input Device in Settings.');
                    return;
                }
                if (!streamConfig.host.trim()) {
                    setErrorMessage('Host is required.');
                    return;
                }
                const portNum = parseInt(streamConfig.port, 10);
                if (!streamConfig.port.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) {
                    setErrorMessage('Port must be a number between 1 and 65535.');
                    return;
                }
                if (!streamConfig.password.trim()) {
                    setErrorMessage('Password is required.');
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

    return (
        <div className="flex h-screen w-screen bg-stone-950 text-white overflow-hidden font-sans">
            {/* Main Content Area */}
            <main className="flex-1 flex flex-col p-6 gap-8">

                {/* Header / Status */}
                <header className="flex justify-between items-center bg-stone-900/50 p-4 rounded-xl border border-stone-800">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-red-500 animate-pulse' : 'bg-stone-600'}`}></div>
                        <span className="text-xl font-bold tracking-wider text-stone-300">RUNTIME STREAMFLOW</span>
                    </div>
                    <div className="text-stone-500 text-sm">v0.5.0</div>
                </header>

                {/* Center Control Panel */}
                <div className="flex-1 flex flex-col items-center justify-center gap-8">

                    {/* Now Playing / Metadata */}
                    <NowPlayingPanel />

                    {/* Cover Art Upload (B2) */}
                    <div className="w-full max-w-sm">
                        <CoverArtPanel />
                    </div>

                    {/* Timer Display */}
                    <div className="w-full flex justify-center">
                        <Timer isRunning={isStreaming} />
                    </div>

                    {/* VU Meters and OnAir Button */}
                    <div className="flex items-center gap-16 w-full justify-center">
                        {/* Left Channel */}
                        <VuMeter label="L" active={isStreaming} />

                        {/* BIG BUTTON */}
                        <OnAirButton
                            isOn={isStreaming}
                            onClick={toggleStream}
                            disabled={streamStatus === 'connecting'}
                        />

                        {/* Right Channel */}
                        <VuMeter label="R" active={isStreaming} />
                    </div>

                </div>

            </main>

            {/* Sidebar Settings */}
            <aside className="w-80 border-l border-stone-800 bg-stone-900/80 p-6 flex flex-col">
                <SettingsPanel />
            </aside>

            {/* Toast Notification (non-blocking) */}
            {errorMessage && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce">
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
