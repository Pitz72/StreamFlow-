import { useState } from 'react';
import { useStore } from '../store/useStore';

const NowPlayingPanel = () => {
    const { streamMetadata, setStreamMetadata, isStreaming } = useStore();
    const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [sentAt, setSentAt] = useState('');

    const handleSend = async () => {
        if (!window.electronAPI || !isStreaming) return;
        setSendStatus('sending');
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
            setTimeout(() => setSendStatus('idle'), 5000);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isStreaming) handleSend();
    };

    return (
        <div className="w-full max-w-2xl bg-stone-900/50 rounded-xl border border-stone-800 p-4">
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">
                Now Playing / Metadata
            </h3>

            <div className="flex flex-col gap-2">
                {/* Show Name — fixed for the session */}
                <div className="flex items-center gap-2">
                    <label className="text-stone-500 text-xs w-14 shrink-0 text-right">Show</label>
                    <input
                        type="text"
                        placeholder="Nome trasmissione / show"
                        value={streamMetadata.showName}
                        onChange={(e) => setStreamMetadata({ showName: e.target.value })}
                        className="flex-1 bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-stone-300 text-sm focus:border-blue-500 focus:outline-none"
                    />
                </div>

                {/* Artist + Title + Send */}
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
                    <p className="text-red-400 text-xs text-right pr-1">✗ Errore invio — server raggiungibile?</p>
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
