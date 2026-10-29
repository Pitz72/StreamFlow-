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
type Tab = 'accesso' | 'audio' | 'registrazione' | 'diagnostica';
const TABS: { id: Tab; label: string }[] = [
    { id: 'accesso', label: 'DJ e accesso' },
    { id: 'audio', label: 'Audio e Mix' },
    { id: 'registrazione', label: 'Registrazione' },
    { id: 'diagnostica', label: 'Diagnostica' },
];

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
        mixMode,
        setMixMode,
        musicGain,
        setMusicGain,
        isStreaming,
        streamStatus,
        setErrorMessage,
    } = useStore();

    // Sessione attiva anche durante collegamento e riconnessione, quando
    // isStreaming è false: cambiare MIX MODE lì fermava il mixer sotto una
    // riconnessione che lo aspettava (sessione chiusa per "mixer muto"), e il
    // test di connessione toglieva il canale al tentativo in corso.
    const sessionActive = isStreaming || streamStatus === 'connecting' || streamStatus === 'reconnecting';

    const [testing, setTesting] = useState(false);
    const [tab, setTab] = useState<Tab>('accesso');
    const [showPassword, setShowPassword] = useState(false);

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
                setErrorMessage('Test connessione fallito — apri il registro eventi in basso per il dettaglio.');
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

    const musicPct = parseInt(musicGain || '100', 10);

    return (
        <div className="flex flex-col">
            {/* Schede: una cosa alla volta, come le impostazioni di Live Machine Pro. */}
            <div role="tablist" aria-label="Sezioni della configurazione" className="flex flex-wrap gap-1.5 px-6 py-3 border-b border-sf-line">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={`h-11 px-5 rounded-xl text-[15px] font-bold border transition-colors ${tab === t.id
                            ? 'bg-sf-greenDeep border-sf-green text-sf-ink'
                            : 'bg-transparent border-transparent text-sf-inkDim hover:text-sf-ink hover:bg-sf-raised'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-5 p-7 text-[15px]">
                {tab === 'accesso' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="sf-card flex flex-col gap-3">
                                <label htmlFor="dj-select" className="sf-label">Chi va in onda</label>
                                <select id="dj-select" value={selectValue} onChange={handleDjChange} className="sf-field w-full">
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
                                        aria-label="Nome utente DJ"
                                        placeholder="Nome utente DJ (streamer AzuraCast)"
                                        value={streamConfig.icecastUser}
                                        onChange={(e) => setStreamConfig({ icecastUser: e.target.value })}
                                        onBlur={() => { if (rememberPassword) void loadSavedPassword(streamConfig.icecastUser); }}
                                        className="sf-field"
                                    />
                                )}
                                <p className="text-[13px] text-sf-inkDim leading-snug">
                                    {STATION_PRESET.stationName}: server, porta e qualità sono già impostati.
                                </p>
                            </div>

                            <div className="sf-card flex flex-col gap-3">
                                <label htmlFor="dj-password" className="sf-label">Password</label>
                                <div className="flex gap-2">
                                    <input
                                        id="dj-password"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={streamConfig.password}
                                        onChange={(e) => setStreamConfig({ password: sanitizePassword(e.target.value) })}
                                        className="sf-field flex-1 min-w-0"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        aria-label={showPassword ? 'Nascondi la password' : 'Mostra la password'}
                                        aria-pressed={showPassword}
                                        title={showPassword ? 'Nascondi la password' : 'Mostra la password'}
                                        className="w-12 h-12 shrink-0 rounded-xl bg-sf-sunken border border-sf-lineStrong text-sf-inkSoft hover:text-sf-ink flex items-center justify-center"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <path d={showPassword
                                                ? 'M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9 M6.6 6.6C3.9 8.3 2 12 2 12s4 7 10 7a9.8 9.8 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2'
                                                : 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'} />
                                        </svg>
                                    </button>
                                </div>
                                <label className="flex items-center justify-between gap-3 font-semibold cursor-pointer select-none">
                                    Ricorda la password su questo computer
                                    <input
                                        type="checkbox"
                                        checked={rememberPassword}
                                        onChange={handleRememberChange}
                                        className="w-5 h-5 accent-[rgb(var(--sf-green))] shrink-0"
                                    />
                                </label>
                                <p className="text-[13px] text-sf-inkDim leading-snug">
                                    Salvata cifrata da Windows, e solo dopo una diretta riuscita.
                                </p>
                            </div>
                        </div>

                        <div className="sf-card flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-col gap-1 min-w-0">
                                <span className="sf-label">Connessione (preimpostata)</span>
                                <span className="font-mono text-[14px] text-sf-ink break-all">
                                    {STATION_PRESET.host}:{STATION_PRESET.port}{STATION_PRESET.mount} · MP3 {STATION_PRESET.bitrate} kbps
                                </span>
                            </div>
                            <span className="text-[12px] font-bold px-2.5 py-1 rounded-md bg-sf-greenDeep text-sf-green">SOLA LETTURA</span>
                        </div>
                    </>
                )}

                {tab === 'audio' && (
                    <>
                        <div className="sf-card flex flex-col gap-3">
                            <label htmlFor="input-device" className="sf-label">Dispositivo di ingresso</label>
                            <select
                                id="input-device"
                                value={selectedDeviceId}
                                onChange={handleDeviceChange}
                                className="sf-field w-full"
                            >
                                <option value="default">Dispositivo predefinito di sistema</option>
                                {devices.map((device) => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[13px] text-sf-inkDim leading-snug">
                                Il volume del microfono è nella schermata principale, sotto il pulsante della diretta.
                            </p>
                        </div>

                        {/* MIX MODE: microfono + audio del PC senza mixer hardware */}
                        <div className="sf-card border-t-[3px] border-t-sf-cyan flex flex-col gap-3">
                            <label className={`flex items-center justify-between gap-3 text-[16px] font-bold select-none ${sessionActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                MIX MODE · voce + audio del computer
                                <input
                                    type="checkbox"
                                    checked={mixMode}
                                    disabled={sessionActive}
                                    onChange={(e) => setMixMode(e.target.checked)}
                                    className="w-5 h-5 accent-[#3EC6E0] shrink-0"
                                />
                            </label>
                            <p className="text-[14px] text-sf-inkDim leading-relaxed">
                                Per chi non ha un mixer: StreamFlow somma la tua voce a tutto quello che
                                il PC sta suonando. Quindi la regia di Runtime Live Machine Pro, ma anche
                                ogni altro suono del computer: notifiche, browser, altri programmi.
                                Non serve installare niente.
                            </p>
                            {mixMode && (
                                <>
                                    <div className="flex items-center justify-between mt-1">
                                        <label htmlFor="music-volume" className="sf-label">Volume musica</label>
                                        <span className="font-mono font-bold text-[16px] tabular-nums text-sf-ink">{musicPct} %</span>
                                    </div>
                                    <input
                                        id="music-volume"
                                        type="range"
                                        min="0"
                                        max="200"
                                        step="5"
                                        value={musicGain}
                                        onChange={(e) => setMusicGain(e.target.value)}
                                        aria-valuetext={`${musicPct} per cento`}
                                        className="sf-slider"
                                        style={{
                                            '--sf-fill': `${(Math.min(200, Math.max(0, musicPct)) / 200) * 100}%`,
                                            '--sf-fill-color': '#3EC6E0',
                                        } as React.CSSProperties}
                                    />
                                    <p className="text-[13px] text-sf-inkDim leading-snug">
                                        La voce segue il Volume microfono della schermata principale. Tutti e due si
                                        regolano anche durante la diretta.
                                    </p>
                                    <div className="rounded-xl bg-sf-sunken border border-sf-line px-4 py-3 flex flex-col gap-1.5">
                                        <p className="text-[14px] text-sf-amberInk leading-snug">
                                            <strong>Ascolta in cuffia.</strong> Con le casse il microfono ripiglia
                                            la musica e in onda si sente doppia.
                                        </p>
                                        <p className="text-[13px] text-sf-inkDim leading-snug">
                                            Il player deve suonare sul dispositivo predefinito di Windows: se ne usa
                                            un altro, tu senti la musica ma in onda non arriva, e la spia Mix in basso
                                            diventa rossa per avvisarti.
                                        </p>
                                    </div>
                                </>
                            )}
                            {sessionActive && (
                                <p className="text-[13px] text-sf-inkDim italic">
                                    Si cambia solo a diretta ferma.
                                </p>
                            )}
                        </div>
                    </>
                )}

                {tab === 'registrazione' && (
                    <div className="sf-card border-t-[3px] border-t-sf-onair flex flex-col gap-3">
                        <label className="flex items-center justify-between gap-3 text-[16px] font-bold cursor-pointer select-none">
                            Salva una copia MP3 della diretta
                            <input
                                type="checkbox"
                                checked={recordLocal}
                                onChange={(e) => setRecordLocal(e.target.checked)}
                                className="w-5 h-5 accent-[#D93A2C] shrink-0"
                            />
                        </label>
                        <p className="text-[14px] text-sf-inkDim leading-relaxed">
                            Un file per sessione in Documenti\StreamFlow, stessa qualità dello stream.
                            Un problema al file (es. disco pieno) non interrompe la diretta.
                        </p>
                    </div>
                )}

                {tab === 'diagnostica' && (
                    <div className="sf-card flex flex-col gap-4">
                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={runConnectionTest}
                                disabled={testing || sessionActive}
                                className="sf-btn bg-sf-greenDeep border-sf-green"
                            >
                                {testing ? 'Test in corso…' : 'Test connessione'}
                            </button>
                            <button
                                type="button"
                                onClick={() => window.electronAPI.openLogFolder()}
                                className="sf-btn"
                            >
                                Apri la cartella dei log
                            </button>
                        </div>
                        <p className="text-[14px] text-sf-inkDim leading-relaxed">
                            <strong className="text-sf-ink">Test connessione</strong> prova DNS, porta
                            e trasmissione (20 secondi di silenzio) e scrive dove si rompe. Non serve il
                            microfono, ma occupa il canale: non lanciarlo mentre qualcuno è in onda.
                            Segui l&apos;esito nel registro eventi in basso.
                        </p>
                        <p className="text-[14px] text-sf-inkDim leading-relaxed">
                            <strong className="text-sf-ink">Apri la cartella dei log</strong> apre i file da
                            allegare in caso di problemi. Contengono i dettagli tecnici; le password non
                            vengono mai scritte nel log.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettingsPanel;
