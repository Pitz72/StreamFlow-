import { useState } from 'react';
import { useStore } from '../store/useStore';

const NowPlayingPanel = () => {
    const { streamMetadata, setStreamMetadata, isStreaming } = useStore();
    const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [sentAt, setSentAt] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const handleSend = async () => {
        if (!window.electronAPI || !isStreaming) return;
        setSendStatus('sending');
        setErrorMsg('');
        const result = await window.electronAPI.updateMetadata({
            artist: streamMetadata.artist,
            title: streamMetadata.title,
        });
        if (result.ok) {
            setSendStatus('sent');
            setSentAt(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
            setTimeout(() => setSendStatus('idle'), 5000);
        } else {
            setSendStatus('error');
            setErrorMsg(result.error || 'errore sconosciuto');
            setTimeout(() => setSendStatus('idle'), 8000);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isStreaming) handleSend();
    };

    return (
        <div>
            <div className="flex flex-col gap-2">
                {/* Artist + Title + Send — protocollo Icecast updinfo invia un solo
                    campo "song" formato come "Artist - Title", quindi non c'è motivo
                    di tenere una terza voce. */}
                <div className="flex items-center gap-2">
                    <label className="text-stone-500 text-xs w-14 shrink-0 text-right">Artist</label>
                    <input
                        type="text"
                        placeholder="Artista / DJ"
                        value={streamMetadata.artist}
                        onChange={(e) => setStreamMetadata({ artist: e.target.value })}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-stone-300 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <label className="text-stone-500 text-xs shrink-0">—</label>
                    <input
                        type="text"
                        placeholder="Titolo brano"
                        value={streamMetadata.title}
                        onChange={(e) => setStreamMetadata({ title: e.target.value })}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-stone-300 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!isStreaming || sendStatus === 'sending'}
                        title={isStreaming ? 'Invia metadati al server (Invio)' : 'Avvia lo stream per inviare'}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition-all shrink-0 ${
                            isStreaming
                                ? 'bg-blue-700 hover:bg-blue-600 text-white cursor-pointer'
                                : 'bg-stone-800 text-stone-600 cursor-not-allowed'
                        } ${sendStatus === 'sending' ? 'opacity-60' : ''}`}
                    >
                        {sendStatus === 'sending' ? '...' : 'Invia'}
                    </button>
                </div>

                {/* Send status feedback */}
                {sendStatus === 'sent' && (
                    <p className="text-green-400 text-xs text-right pr-1">✓ Inviato alle {sentAt}</p>
                )}
                {sendStatus === 'error' && (
                    <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded px-2 py-1.5">
                        ✗ {errorMsg}
                    </p>
                )}
                {!isStreaming && (
                    <p className="text-stone-600 text-xs text-right pr-1">
                        I metadati verranno inviati automaticamente all'avvio dello stream.
                    </p>
                )}
            </div>
        </div>
    );
};

export default NowPlayingPanel;
