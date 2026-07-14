import { useState } from 'react';
import { useAudioDevices } from '../hooks/useAudioDevices';
import { useStore } from '../store/useStore';
import AzuraCastWizard from './AzuraCastWizard';

const SettingsPanel = () => {
    const { devices } = useAudioDevices();
    const {
        selectedDeviceId,
        setSelectedDeviceId,
        setSelectedDeviceLabel,
        streamConfig,
        setStreamConfig,
        profiles,
        saveProfile,
        loadProfile,
        deleteProfile,
    } = useStore();

    const [savingName, setSavingName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setStreamConfig({ [e.target.name]: e.target.value });
    };

    const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const deviceId = e.target.value;
        setSelectedDeviceId(deviceId);
        const device = devices.find(d => d.deviceId === deviceId);
        setSelectedDeviceLabel(device ? device.label : 'default');
    };

    const handleProfileLoad = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const name = e.target.value;
        setSelectedProfile(name);
        if (name) loadProfile(name);
    };

    const handleSave = () => {
        const name = savingName.trim();
        if (!name) return;
        saveProfile(name);
        setSelectedProfile(name);
        setSavingName('');
        setShowSaveInput(false);
    };

    const handleDelete = () => {
        if (!selectedProfile) return;
        deleteProfile(selectedProfile);
        setSelectedProfile('');
    };

    return (
        <div className="flex flex-col gap-6 text-sm relative">
            <AzuraCastWizard />

            {/* Server Profiles (B1) */}
            <div className="flex flex-col gap-2">
                <label className="text-deco-brassLabel uppercase text-[10px] font-ui font-semibold tracking-[2px]">Server Profiles</label>
                <select
                    value={selectedProfile}
                    onChange={handleProfileLoad}
                    className="bg-deco-bg border border-deco-brass/30 rounded-[3px] px-[11px] py-[9px] text-deco-ink focus:border-deco-brass focus:outline-none w-full"
                >
                    <option value="">— Seleziona profilo —</option>
                    {profiles.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                </select>
                <div className="flex gap-2">
                    {!showSaveInput ? (
                        <button
                            onClick={() => { setSavingName(selectedProfile || ''); setShowSaveInput(true); }}
                            className="flex-1 text-xs font-ui uppercase tracking-[1px] bg-transparent hover:bg-deco-brass/10 text-deco-brass border border-deco-brass/40 rounded-[2px] px-3 py-1.5 transition-colors"
                        >
                            + Salva profilo
                        </button>
                    ) : (
                        <>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Nome profilo"
                                value={savingName}
                                onChange={(e) => setSavingName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false); }}
                                className="flex-1 bg-deco-bg border border-deco-brass rounded-[3px] px-2 py-1 text-deco-ink text-xs focus:outline-none"
                            />
                            <button
                                onClick={handleSave}
                                disabled={!savingName.trim()}
                                className="text-xs bg-deco-success hover:brightness-110 disabled:opacity-40 text-deco-bg font-bold rounded-[2px] px-3 py-1 transition-all"
                            >
                                ✓
                            </button>
                            <button
                                onClick={() => setShowSaveInput(false)}
                                className="text-xs bg-transparent hover:bg-deco-brass/10 text-deco-inkDim border border-deco-brass/30 rounded-[2px] px-2 py-1 transition-colors"
                            >
                                ✕
                            </button>
                        </>
                    )}
                    {selectedProfile && !showSaveInput && (
                        <button
                            onClick={handleDelete}
                            className="text-xs bg-transparent hover:bg-deco-onair/15 text-deco-onair border border-deco-onair/40 rounded-[2px] px-3 py-1.5 transition-colors"
                        >
                            Elimina
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-deco-brassLabel uppercase text-[10px] font-ui font-semibold tracking-[2px]">Audio Input Device</label>
                <select
                    value={selectedDeviceId}
                    onChange={handleDeviceChange}
                    className="bg-deco-bg border border-deco-brass/30 rounded-[3px] px-[11px] py-[9px] text-deco-ink focus:border-deco-brass focus:outline-none w-full"
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
                <label className="text-deco-brassLabel uppercase text-[10px] font-ui font-semibold tracking-[2px]">Host</label>
                <input
                    name="host"
                    type="text"
                    value={streamConfig.host}
                    onChange={handleChange}
                    className="bg-deco-bg border border-deco-brass/30 rounded-[3px] px-[11px] py-[9px] text-deco-ink focus:border-deco-brass focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-deco-brassLabel uppercase text-[10px] font-ui font-semibold tracking-[2px]">Port</label>
                <input
                    name="port"
                    type="text"
                    value={streamConfig.port}
                    onChange={handleChange}
                    className="bg-deco-bg border border-deco-brass/30 rounded-[3px] px-[11px] py-[9px] text-deco-ink focus:border-deco-brass focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-deco-brassLabel uppercase text-[10px] font-ui font-semibold tracking-[2px]">Icecast User (DJ)</label>
                <input
                    name="icecastUser"
                    type="text"
                    value={streamConfig.icecastUser}
                    onChange={handleChange}
                    placeholder="source"
                    className="bg-deco-bg border border-deco-brass/30 rounded-[3px] px-[11px] py-[9px] text-deco-ink focus:border-deco-brass focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-deco-brassLabel uppercase text-[10px] font-ui font-semibold tracking-[2px]">Password</label>
                <input
                    name="password"
                    type="password"
                    value={streamConfig.password}
                    onChange={handleChange}
                    className="bg-deco-bg border border-deco-brass/30 rounded-[3px] px-[11px] py-[9px] text-deco-ink focus:border-deco-brass focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-deco-brassLabel uppercase text-[10px] font-ui font-semibold tracking-[2px]">Mount Point</label>
                <input
                    name="mount"
                    type="text"
                    value={streamConfig.mount}
                    onChange={handleChange}
                    className="bg-deco-bg border border-deco-brass/30 rounded-[3px] px-[11px] py-[9px] text-deco-ink focus:border-deco-brass focus:outline-none"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-deco-brassLabel uppercase text-[10px] font-ui font-semibold tracking-[2px]">Bitrate</label>
                <select
                    name="bitrate"
                    value={streamConfig.bitrate}
                    onChange={(e) => setStreamConfig({ bitrate: e.target.value })}
                    className="bg-deco-bg border border-deco-brass/30 rounded-[3px] px-[11px] py-[9px] text-deco-ink focus:border-deco-brass focus:outline-none"
                >
                    <option value="64">64 kbps</option>
                    <option value="96">96 kbps</option>
                    <option value="128">128 kbps</option>
                    <option value="192">192 kbps</option>
                    <option value="256">256 kbps</option>
                    <option value="320">320 kbps</option>
                </select>
            </div>

            <p className="text-deco-inkDim text-xs italic">
                Input Volume è ora nella schermata principale, sotto il pulsante ON AIR.
            </p>

        </div>
    );
};

export default SettingsPanel;
