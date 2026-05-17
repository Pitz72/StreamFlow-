import { useState } from 'react';
import { useStore } from '../store/useStore';

type WizardState = 'idle' | 'loading-stations' | 'select-station' | 'loading-detail' | 'select-streamer' | 'error';

const INFO_TEXT = `Come trovare le credenziali AzuraCast:

1. Accedi al pannello di amministrazione AzuraCast
2. Vai su "Il mio account" → "API Keys"
3. Crea una nuova chiave. Per il rilevamento automatico
   della porta DJ serve il permesso
   "Manage Station Broadcasting" sulla stazione
   (o ruolo di amministratore globale).
4. Copia la chiave e incollala nel campo API Key

URL: indirizzo del tuo server AzuraCast
(es. https://radio.example.com)

Se la API Key non ha il permesso admin, il wizard
userà i default (porta 8005, mount /) — verifica
i valori in AzuraCast → Broadcasting → How do I connect?

La password DJ va inserita manualmente
per motivi di sicurezza.`;

const AzuraCastWizard = () => {
    const { setStreamConfig, setAzuraCastContext } = useStore();
    const [open, setOpen] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');

    const [state, setState] = useState<WizardState>('idle');
    const [error, setError] = useState('');

    const [stations, setStations] = useState<AzStation[]>([]);
    const [selectedStationId, setSelectedStationId] = useState<number | null>(null);

    const [detail, setDetail] = useState<AzStationDetail | null>(null);
    const [selectedStreamerUsername, setSelectedStreamerUsername] = useState('');
    // Port e mount harbor editabili — l'utente li può correggere prima di "Applica".
    const [editPort, setEditPort] = useState('8005');
    const [editMount, setEditMount] = useState('/');

    const loadStations = async () => {
        if (!url.trim() || !apiKey.trim()) {
            setError('Inserisci URL e API Key.');
            return;
        }
        setState('loading-stations');
        setError('');
        const res = await window.electronAPI.azuraCastFetchStations({ url: url.trim(), apiKey: apiKey.trim() });
        if (!res.ok || !res.stations) {
            setState('error');
            setError(res.error || 'Errore sconosciuto');
            return;
        }
        setStations(res.stations);
        setSelectedStationId(res.stations[0]?.id ?? null);
        setState('select-station');
    };

    const loadDetail = async () => {
        if (!selectedStationId) return;
        setState('loading-detail');
        setError('');
        const res = await window.electronAPI.azuraCastFetchStationDetail({
            url: url.trim(),
            apiKey: apiKey.trim(),
            stationId: selectedStationId,
        });
        if (!res.ok || !res.detail) {
            setState('error');
            setError(res.error || 'Errore sconosciuto');
            return;
        }
        setDetail(res.detail);
        setSelectedStreamerUsername(res.detail.streamers[0]?.username ?? '');
        setEditPort(res.detail.port);
        setEditMount(res.detail.mount);
        setState('select-streamer');
    };

    const apply = () => {
        if (!detail || !selectedStationId) return;
        const cleanMount = editMount.trim() || '/';
        setStreamConfig({
            host: detail.host,
            port: editPort.trim() || '8005',
            mount: cleanMount.startsWith('/') ? cleanMount : `/${cleanMount}`,
            icecastUser: selectedStreamerUsername || 'source',
        });
        setAzuraCastContext(url.trim(), apiKey.trim(), selectedStationId);
        setOpen(false);
        setState('idle');
    };

    const reset = () => {
        setState('idle');
        setError('');
        setStations([]);
        setDetail(null);
    };

    if (!open) {
        return (
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setOpen(true)}
                    className="flex-1 text-xs bg-stone-800 hover:bg-stone-700 text-blue-400 hover:text-blue-300 border border-stone-700 rounded px-3 py-2 transition-colors text-left"
                >
                    Configura da AzuraCast
                </button>
                <button
                    onClick={() => setShowInfo(!showInfo)}
                    title="Come funziona"
                    className="w-7 h-7 rounded-full bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-400 hover:text-stone-200 text-xs font-bold transition-colors"
                >
                    ⓘ
                </button>
                {showInfo && (
                    <div className="absolute right-6 top-auto z-50 w-72 bg-stone-900 border border-stone-600 rounded-xl p-4 shadow-2xl">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">AzuraCast Auto-Config</span>
                            <button onClick={() => setShowInfo(false)} className="text-stone-500 hover:text-stone-200 text-sm">✕</button>
                        </div>
                        <pre className="text-xs text-stone-400 whitespace-pre-wrap leading-relaxed">{INFO_TEXT}</pre>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-stone-950 border border-blue-900/50 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">AzuraCast Auto-Config</span>
                <button onClick={() => { setOpen(false); reset(); }} className="text-stone-500 hover:text-stone-200 text-sm">✕</button>
            </div>

            {/* URL + API Key */}
            <div className="flex flex-col gap-2">
                <input
                    type="url"
                    placeholder="https://radio.example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={state !== 'idle' && state !== 'error'}
                    className="bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-stone-300 text-xs focus:border-blue-500 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                    <input
                        type="password"
                        placeholder="API Key"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        disabled={state !== 'idle' && state !== 'error'}
                        className="flex-1 bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-stone-300 text-xs focus:border-blue-500 focus:outline-none"
                    />
                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        title="Come ottenere l'API Key"
                        className="w-6 h-6 rounded-full bg-stone-800 border border-stone-700 text-stone-400 hover:text-stone-200 text-xs font-bold transition-colors shrink-0"
                    >
                        ⓘ
                    </button>
                </div>
                {showInfo && (
                    <div className="bg-stone-900 border border-stone-700 rounded-lg p-3">
                        <pre className="text-xs text-stone-400 whitespace-pre-wrap leading-relaxed">{INFO_TEXT}</pre>
                    </div>
                )}
            </div>

            {error && (
                <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded px-2 py-1.5">{error}</p>
            )}

            {/* Step 1: Load stations */}
            {(state === 'idle' || state === 'error') && (
                <button
                    onClick={loadStations}
                    className="bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded px-3 py-1.5 transition-colors"
                >
                    Carica stazioni
                </button>
            )}

            {state === 'loading-stations' && (
                <p className="text-stone-500 text-xs animate-pulse">Caricamento stazioni...</p>
            )}

            {/* Step 2: Select station */}
            {(state === 'select-station') && (
                <div className="flex flex-col gap-2">
                    <label className="text-stone-500 text-xs">Stazione</label>
                    <select
                        value={selectedStationId ?? ''}
                        onChange={(e) => setSelectedStationId(Number(e.target.value))}
                        className="bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-stone-300 text-xs focus:border-blue-500 focus:outline-none"
                    >
                        {stations.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={loadDetail}
                        className="bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded px-3 py-1.5 transition-colors"
                    >
                        Carica DJ / Streamer
                    </button>
                </div>
            )}

            {state === 'loading-detail' && (
                <p className="text-stone-500 text-xs animate-pulse">Caricamento dettagli stazione...</p>
            )}

            {/* Step 3: Select streamer + apply */}
            {state === 'select-streamer' && detail && (
                <div className="flex flex-col gap-2">
                    <div className="text-xs text-stone-500 uppercase tracking-wider">DJ connection (Liquidsoap harbor)</div>
                    <div className="text-xs text-stone-400 bg-stone-900 rounded px-2 py-1.5 font-mono">
                        {detail.host}:{editPort}{editMount.startsWith('/') ? editMount : `/${editMount}`}
                    </div>
                    <div className="flex gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-stone-500 text-xs">Porta DJ</label>
                            <input
                                type="text"
                                value={editPort}
                                onChange={(e) => setEditPort(e.target.value)}
                                className="bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-stone-300 text-xs focus:border-blue-500 focus:outline-none font-mono"
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-stone-500 text-xs">Mount DJ</label>
                            <input
                                type="text"
                                value={editMount}
                                onChange={(e) => setEditMount(e.target.value)}
                                className="bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-stone-300 text-xs focus:border-blue-500 focus:outline-none font-mono"
                            />
                        </div>
                    </div>
                    {detail.harborInferred ? (
                        <p className="text-yellow-400 text-xs bg-yellow-950/30 border border-yellow-900/50 rounded px-2 py-1.5">
                            ⚠ Porta harbor non leggibile dall'API (la API Key potrebbe non avere il permesso "Manage Station Broadcasting").
                            Sto usando i default AzuraCast — verifica in <span className="font-bold">AzuraCast → Broadcasting → How do I connect? → Icecast Clients</span> e correggi se necessario.
                        </p>
                    ) : (
                        <p className="text-green-500 text-xs">✓ Porta DJ letta automaticamente dall'API admin.</p>
                    )}
                    {detail.streamers.length > 0 ? (
                        <>
                            <label className="text-stone-500 text-xs">Account DJ / Streamer</label>
                            <select
                                value={selectedStreamerUsername}
                                onChange={(e) => setSelectedStreamerUsername(e.target.value)}
                                className="bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-stone-300 text-xs focus:border-blue-500 focus:outline-none"
                            >
                                {detail.streamers.map((s) => (
                                    <option key={s.id} value={s.username}>{s.displayName} ({s.username})</option>
                                ))}
                            </select>
                        </>
                    ) : (
                        <p className="text-stone-500 text-xs">Nessun account DJ trovato — verrà usato "source".</p>
                    )}
                    <p className="text-stone-600 text-xs">La password va inserita manualmente nel campo Password.</p>
                    <button
                        onClick={apply}
                        className="bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded px-3 py-1.5 transition-colors"
                    >
                        ✓ Applica configurazione
                    </button>
                </div>
            )}
        </div>
    );
};

export default AzuraCastWizard;
