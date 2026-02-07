import { useEffect } from 'react'
import Timer from './components/Timer'
import VuMeter from './components/VuMeter'
import OnAirButton from './components/OnAirButton'
import SettingsPanel from './components/SettingsPanel'
import { useStore } from './store/useStore'

function App() {
    // const [isStreaming, setIsStreaming] = useState(false) // Removed in favor of global store
    const {
        streamConfig,
        selectedDeviceId,
        selectedDeviceLabel,
        isStreaming,
        setIsStreaming,
        setStreamStatus
    } = useStore()

    // Listen for status updates from Main process
    useEffect(() => {
        // @ts-ignore
        if (window.electronAPI && window.electronAPI.onStreamStatus) {
            // @ts-ignore
            window.electronAPI.onStreamStatus((status, message) => {
                console.log("Stream Status:", status, message);
                setStreamStatus(status); // Update global status

                if (status === 'connected') {
                    setIsStreaming(true);
                } else if (status === 'disconnected' || status === 'error') {
                    setIsStreaming(false);
                    if (status === 'error') {
                        alert(`Streaming Error: ${message}`);
                    }
                } else if (status === 'connecting') {
                    // Could add a connecting state if needed
                }
            });
        }
    }, [setIsStreaming, setStreamStatus]);

    const toggleStream = () => {
        // @ts-ignore
        if (window.electronAPI) {
            if (!isStreaming) {
                // Validate Device Selection
                if (selectedDeviceId === 'default' || !selectedDeviceLabel || selectedDeviceLabel === 'default') {
                    alert('Please select a specific Audio Input Device in Settings.');
                    return;
                }

                // Get the real device LABEL or ID to pass to backend. 
                // Creating the config object to send to IPC
                const startConfig = {
                    ...streamConfig,
                    inputDeviceName: selectedDeviceLabel // Send the Label (Name) which dshow needs
                };

                // Note: The backend expects 'inputDeviceName'. If we pass an ID, dshow might not like it.
                // We need to fetch the label corresponding to the ID if possible, OR
                // Update useAudioDevices to store both ID and Label in store? 
                // Or just search it again here? 
                // Let's try to lookup the label if we can, or just send what we have.
                // Actually, Windows dshow often requires the readable Name (e.g. "Microphone (Realtek Audio)").
                // The 'selectedDeviceId' from enumerateDevices() is usually a hash string in browser.
                // BUT we need the label.

                // Quick fix: We need access to the devices list to find the label by ID.
                // But useAudioDevices is a hook.
                // Let's assume for this step we might have issues if we send the ID.
                // I will add a lookup in the store or just pass the ID.
                // Wait, useStore stores only SelectedDeviceId. 
                // We should probably store the selected LABEL as well or look it up.
                // I'll trust the user selected 'default' or a valid device.
                // If I can't look it up easily without re-enumerating, I'll pass selectedDeviceId.
                // Actually, let's trigger a re-enumeration or just pass 'default' if it fails?
                // No, let's try to pass the ID. FFmpeg dshow on windows usually needs names: "Microphone (X)".

                // Better approach: In SettingsPanel we have the list. We could store the label too.
                // But for now, let's send 'audio=selectedDeviceId'. 
                // If it fails, the log will show it.
                // @ts-ignore
                window.electronAPI.startStream(startConfig);
            } else {
                // @ts-ignore
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
                    <div className="text-stone-500 text-sm">v0.0.8</div>
                </header>

                {/* Center Control Panel */}
                <div className="flex-1 flex flex-col items-center justify-center gap-12">

                    {/* Timer Display */}
                    <div className="w-full flex justify-center">
                        <Timer isRunning={isStreaming} />
                    </div>

                    {/* VU Meters and OnAir Button */}
                    <div className="flex items-center gap-16 w-full justify-center">
                        {/* Left Channel */}
                        <VuMeter label="L" active={isStreaming} />

                        {/* BIG BUTTON */}
                        <OnAirButton isOn={isStreaming} onClick={toggleStream} />

                        {/* Right Channel */}
                        <VuMeter label="R" active={isStreaming} />
                    </div>

                </div>

            </main>

            {/* Sidebar Settings */}
            <aside className="w-80 border-l border-stone-800 bg-stone-900/80 p-6 flex flex-col">
                <SettingsPanel />
            </aside>
        </div>
    )
}

export default App
