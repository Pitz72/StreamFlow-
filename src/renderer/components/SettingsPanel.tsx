import { useAudioDevices } from '../hooks/useAudioDevices';
import { useStore } from '../store/useStore';

const SettingsPanel = () => {
    const { devices } = useAudioDevices();
    const {
        selectedDeviceId,
        setSelectedDeviceId,
        setSelectedDeviceLabel,
        streamConfig,
        setStreamConfig
    } = useStore();

    // Local config state removed in favor of global streamConfig

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setStreamConfig({ [e.target.name]: e.target.value });
    };

    const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const deviceId = e.target.value;
        setSelectedDeviceId(deviceId);

        // Find label
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

            <div className="mt-auto">
                <div className="bg-stone-800/50 p-3 rounded text-xs text-stone-500">
                    Status: <span className="text-stone-400">Ready</span>
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;
