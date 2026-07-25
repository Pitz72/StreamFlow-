import { useState } from 'react';
import { useAudioDevices } from '../hooks/useAudioDevices';
import { useStore } from '../store/useStore';
import { STATION_PRESET, OTHER_DJ } from '../config/stationPreset';

/**
 * Ripulisce la password incollata.
 *
 * Caso reale (25/07/2026): una DJ selezionava la password con doppio click e la
 * incollava portandosi dentro caratteri invisibili. Il server rispondeva 401, ma
 * FFmpeg non legge la risposta e mostrava solo un errore di rete (-10054): un
 * pomeriggio di diagnosi per uno spazio di troppo.
 *
 * Toglie a capo, tabulazioni e spazi a inizio/fine — nessuno dei quali può far
 * parte di una password digitata a mano — e gli spazi a larghezza zero, che il
 * doppio click sui browser si porta dietro con allegria.
 */
const sanitizePassword = (raw: string) =>
    // Gli spazi interni restano: potrebbero far parte davvero della password.
    // trim() toglie anche gli spazi unicode (NBSP incluso) alle estremita'.
    raw.replace(/[\r\n\t\u200B-\u200D\uFEFF]/g, '').trim();

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
        recordLocal,
        setRecordLocal,
        isStreaming,
        setErrorMessage,
    } = useStore();

    const [testing, setTesting] = useState(false);

    // D2: il test occupa il mount per una ventina di secondi con un segnale di
    // prova, quindi non deve mai partire durante una diretta.
    const runConnectionTest = async () => {
        if (!streamConfig.password.trim()) {
            setErrorMessage('Inserisci la password prima di lanciare il test.');
            return;
        }
        setTesting(true);
        try {
            const res = await window.electronAPI.runConnectionTest({
                host: streamConfig.host,
                port: streamConfig.port,
                mount: streamConfig.mount,
                icecastUser: streamConfig.icecastUser,
                password: streamConfig.password,
                bitrate: streamConfig.bitrate,
            });
            if (!res.ok) {
                setErrorMessage('Test connessione fallito — apri il pannello Log in basso per il dettaglio.');
            }
        } catch {
            setErrorMessage('Impossibile eseguire il test di connessione.');
        } finally {
            setTesting(false);
        }
    };

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
                    onChange={(e) => setStreamConfig({ password: sanitizePassword(e.target.value) })}
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

            {/* C2: registrazione locale della diretta */}
            <div className="flex flex-col gap-2">
                <label className={labelCls}>Registrazione locale</label>
                <label className="flex items-center gap-2 text-deco-ink text-xs cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={recordLocal}
                        onChange={(e) => setRecordLocal(e.target.checked)}
                        className="accent-[#C8A44E]"
                    />
                    Salva una copia MP3 della diretta in Documenti\StreamFlow
                </label>
                <p className="text-deco-inkDim text-[11px] leading-snug">
                    Un file per sessione, stessa qualità dello stream. Un problema al file
                    (es. disco pieno) non interrompe la diretta.
                </p>
            </div>

            {/* Dettagli connessione (sola lettura, per diagnostica) */}
            <div className="flex flex-col gap-1">
                <label className={labelCls}>Connessione (preimpostata)</label>
                <div className="bg-deco-bg border border-deco-brass/20 rounded-[3px] px-3 py-2 font-mono text-xs text-deco-inkDim">
                    {STATION_PRESET.host}:{STATION_PRESET.port}{STATION_PRESET.mount} · MP3 {STATION_PRESET.bitrate} kbps
                </div>
            </div>

            {/* D1: accesso al log diagnostico, per farsi mandare il file dall'utente */}
            <div className="flex flex-col gap-2">
                <label className={labelCls}>Diagnostica</label>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={runConnectionTest}
                        disabled={testing || isStreaming}
                        className="px-4 py-2 rounded-[2px] text-xs font-ui font-semibold uppercase tracking-[2px] border border-deco-brass/50 bg-transparent hover:bg-deco-brass/10 disabled:opacity-40 disabled:cursor-not-allowed text-deco-brass transition-colors"
                    >
                        {testing ? 'Test in corso…' : 'Test connessione'}
                    </button>
                    <button
                        type="button"
                        onClick={() => window.electronAPI.openLogFolder()}
                        className="px-4 py-2 rounded-[2px] text-xs font-ui font-semibold uppercase tracking-[2px] border border-deco-brass/50 bg-transparent hover:bg-deco-brass/10 text-deco-brass transition-colors"
                    >
                        Apri cartella log
                    </button>
                </div>
                <p className="text-deco-inkDim text-[11px] leading-snug">
                    <strong className="text-deco-ink">Test connessione</strong> prova DNS, porta
                    e trasmissione (20 secondi di silenzio) e scrive dove si rompe. Non serve il
                    microfono, ma occupa il canale: non lanciarlo mentre qualcuno è in onda.
                    Segui l&apos;esito nel pannello Log in basso.
                </p>
                <p className="text-deco-inkDim text-[11px] leading-snug">
                    <strong className="text-deco-ink">Apri cartella log</strong> apre i file da
                    allegare in caso di problemi. Contengono i dettagli tecnici; le password non
                    vengono mai scritte nel log.
                </p>
            </div>

            <p className="text-deco-inkDim text-xs italic">
                Input Volume è nella schermata principale, sotto il pulsante ON AIR.
            </p>
        </div>
    );
};

export default SettingsPanel;
