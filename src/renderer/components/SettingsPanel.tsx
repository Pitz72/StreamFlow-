import { useAudioDevices } from '../hooks/useAudioDevices';
import { useStore } from '../store/useStore';

const statusLabels: Record<string, string> = {
    disconnected: 'Ready',
    connecting: 'Connecting...',
    connected: 'ON AIR',
    error: 'Error',
};

const statusColors: Record<string, string> = {
    disconnected: 'text-stone-400',
    connecting: 'text-yellow-400',
    connected: 'text-red-400',
    error: 'text-orange-400',
};

const SettingsPanel = () => {
    const { devices } = useAudioDevices();
    const {
        selectedDeviceId,
        setSelectedDeviceId,
        setSelectedDeviceLabel,
        streamConfig,
        setStreamConfig,
        streamStatus
    } = useStore();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setStreamConfig({ [e.target.name]: e.target.value });
    };

    const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const deviceId = e.target.value;
        setSelectedDeviceId(deviceId);

        const device = devices.find(d => d.deviceId === deviceId);
        if (device) {
            setSelectedDeviceLabel(device.label);
        } else {
            setSelectedDeviceLabel('default');
        }
    };

    return (
        <div className="flex flex-col gap-6 text-sm">
            <h2 className="text-xl font-bold text-stone-300 border-b border-stone-700 pb-2">Settings</h2>

            <div className="flex flex-col gap-2">
                <label className="text-stone-500 uppercase text-xs font-bold tracking-wider">Audio Input Device</label>
                <select
                    value={selectedDeviceId}
                    onChange={handleDeviceChange}
                    className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-300 focus:border-blue-500 focus:outline-none w-full"
                >
                    <option value="default">Default System Device</option>
                    {devices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                            {device.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-stone-500 uppercase text-xs font-bold tracking-wider">Host</label>
                <input
                    name="host"
                    type="text"
                    value={streamConfig.host}
                    onChange={handleChange}
                    className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-300 focus:border-blue-500 focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-stone-500 uppercase text-xs font-bold tracking-wider">Port</label>
                <input
                    name="port"
                    type="text"
                    value={streamConfig.port}
                    onChange={handleChange}
                    className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-300 focus:border-blue-500 focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-stone-500 uppercase text-xs font-bold tracking-wider">Icecast User (DJ)</label>
                <input
                    name="icecastUser"
                    type="text"
                    value={streamConfig.icecastUser}
                    onChange={handleChange}
                    placeholder="source"
                    className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-300 focus:border-blue-500 focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-stone-500 uppercase text-xs font-bold tracking-wider">Password</label>
                <input
                    name="password"
                    type="password"
                    value={streamConfig.password}
                    onChange={handleChange}
                    className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-300 focus:border-blue-500 focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-stone-500 uppercase text-xs font-bold tracking-wider">Mount Point</label>
                <input
                    name="mount"
                    type="text"
                    value={streamConfig.mount}
                    onChange={handleChange}
                    className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-300 focus:border-blue-500 focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-stone-500 uppercase text-xs font-bold tracking-wider">Bitrate</label>
                <select
                    name="bitrate"
                    value={streamConfig.bitrate}
                    onChange={(e) => setStreamConfig({ bitrate: e.target.value })}
                    className="bg-stone-950 border border-stone-800 rounded p-2 text-stone-300 focus:border-blue-500 focus:outline-none"
                >
                    <option value="64">64 kbps</option>
                    <option value="96">96 kbps</option>
                    <option value="128">128 kbps</option>
                    <option value="192">192 kbps</option>
                    <option value="256">256 kbps</option>
                    <option value="320">320 kbps</option>
                </select>
            </div>

            <div className="mt-auto">
                <div className="bg-stone-800/50 p-3 rounded text-xs text-stone-500">
                    Status: <span className={statusColors[streamStatus] || 'text-stone-400'}>{statusLabels[streamStatus] || 'Unknown'}</span>
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;
