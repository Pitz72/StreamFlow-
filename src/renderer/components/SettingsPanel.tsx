import { useAudioDevices } from '../hooks/useAudioDevices';
import { useStore } from '../store/useStore';
import { STATION_PRESET, OTHER_DJ } from '../config/stationPreset';

/**
 * Configurazione "interna Runtime Radio": i parametri di connessione sono
 * preimpostati dal preset di stazione. L'utente sceglie solo il proprio nome
 * utente DJ, inserisce la password e seleziona il dispositivo audio.
 */
const SettingsPanel = () => {
    const { devices } = useAudioDevices();
    const {
        selectedDeviceId,
        setSelectedDeviceId,
        setSelectedDeviceLabel,
        streamConfig,
        setStreamConfig,
        rememberPassword,
        setRememberPassword,
    } = useStore();

    const knownDj = STATION_PRESET.djs.some(d => d.username === streamConfig.icecastUser);
    // Utente fuori elenco (config migrata o inserimento manuale) → modalità "Altro".
    const selectValue = knownDj ? streamConfig.icecastUser : OTHER_DJ;

    const loadSavedPassword = async (username: string) => {
        if (!window.electronAPI?.loadDjPassword || !username) return;
        try {
            const { password } = await window.electronAPI.loadDjPassword({ username });
            if (password) setStreamConfig({ password });
        } catch { /* nessuna password salvata */ }
    };

    const handleDjChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === OTHER_DJ) {
            setStreamConfig({ icecastUser: '', password: '' });
            return;
        }
        setStreamConfig({ icecastUser: value, password: '' });
        if (rememberPassword) void loadSavedPassword(value);
    };

    const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const deviceId = e.target.value;
        setSelectedDeviceId(deviceId);
        const device = devices.find(d => d.deviceId === deviceId);
        setSelectedDeviceLabel(device ? device.label : 'default');
    };

    const handleRememberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const remember = e.target.checked;
        setRememberPassword(remember);
        // Disattivando la memoria, la password salvata per questo utente viene rimossa.
        if (!remember && streamConfig.icecastUser && window.electronAPI?.deleteDjPassword) {
            void window.electronAPI.deleteDjPassword({ username: streamConfig.icecastUser });
        }
    };

    const inputCls = "bg-deco-bg border border-deco-brass/30 rounded-[3px] px-[11px] py-[9px] text-deco-ink focus:border-deco-brass focus:outline-none";
    const labelCls = "text-deco-brassLabel uppercase text-[10px] font-ui font-semibold tracking-[2px]";

    return (
        <div className="flex flex-col gap-6 text-sm relative">
            {/* Banner stazione preconfigurata */}
            <div className="bg-deco-bg border border-deco-brass/30 rounded-[8px] px-4 py-3">
                <p className="text-deco-brass font-ui font-semibold uppercase tracking-[2px] text-[11px]">
                    {STATION_PRESET.stationName} — client interno
                </p>
                <p className="text-deco-inkDim text-xs mt-1">
                    Server, porta e qualità sono già impostati. Scegli il tuo nome utente,
                    inserisci la password e sei pronto.
                </p>
            </div>

            {/* Nome utente DJ */}
            <div className="flex flex-col gap-2">
                <label className={labelCls}>Nome utente (DJ)</label>
                <select
                    value={selectValue}
                    onChange={handleDjChange}
                    className={`${inputCls} w-full`}
                >
                    {STATION_PRESET.djs.map((dj) => (
                        <option key={dj.username} value={dj.username}>
                            {dj.displayName} ({dj.username})
                        </option>
                    ))}
                    <option value={OTHER_DJ}>Altro utente…</option>
                </select>
                {selectValue === OTHER_DJ && (
                    <input
                        type="text"
                        placeholder="Nome utente DJ (streamer AzuraCast)"
                        value={streamConfig.icecastUser}
                        onChange={(e) => setStreamConfig({ icecastUser: e.target.value })}
                        onBlur={() => { if (rememberPassword) void loadSavedPassword(streamConfig.icecastUser); }}
                        className={inputCls}
                    />
                )}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-2">
                <label className={labelCls}>Password</label>
                <input
                    name="password"
                    type="password"
                    value={streamConfig.password}
                    onChange={(e) => setStreamConfig({ password: e.target.value })}
                    className={inputCls}
                />
                <label className="flex items-center gap-2 text-deco-inkDim text-xs cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={rememberPassword}
                        onChange={handleRememberChange}
                        className="accent-[#C8A44E]"
                    />
                    Ricorda la password su questo computer (salvata cifrata)
                </label>
            </div>

            {/* Dispositivo audio */}
            <div className="flex flex-col gap-2">
                <label className={labelCls}>Audio Input Device</label>
                <select
                    value={selectedDeviceId}
                    onChange={handleDeviceChange}
                    className={`${inputCls} w-full`}
                >
                    <option value="default">Default System Device</option>
                    {devices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                            {device.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Dettagli connessione (sola lettura, per diagnostica) */}
            <div className="flex flex-col gap-1">
                <label className={labelCls}>Connessione (preimpostata)</label>
                <div className="bg-deco-bg border border-deco-brass/20 rounded-[3px] px-3 py-2 font-mono text-xs text-deco-inkDim">
                    {STATION_PRESET.host}:{STATION_PRESET.port}{STATION_PRESET.mount} · MP3 {STATION_PRESET.bitrate} kbps
                </div>
            </div>

            <p className="text-deco-inkDim text-xs italic">
                Input Volume è nella schermata principale, sotto il pulsante ON AIR.
            </p>
        </div>
    );
};

export default SettingsPanel;
