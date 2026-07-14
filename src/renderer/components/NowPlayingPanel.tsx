import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

const NowPlayingPanel = () => {
    const { streamMetadata, setStreamMetadata, isStreaming } = useStore();
    const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [sentAt, setSentAt] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [lastDebug, setLastDebug] = useState<{ requestLine?: string; rawResponse?: string; httpStatus?: number } | null>(null);
    const [showDebug, setShowDebug] = useState(false);

    // Timeout di reset dello stato: va ripulito alla chiusura del modale
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        return () => {
            if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        };
    }, []);

    const scheduleReset = (ms: number) => {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => setSendStatus('idle'), ms);
    };

    const handleSend = async () => {
        // Guard anche su 'sending': Enter nei campi permetteva invii concorrenti
        if (!window.electronAPI || !isStreaming || sendStatus === 'sending') return;
        setSendStatus('sending');
        setErrorMsg('');
        try {
            const result = await window.electronAPI.updateMetadata({
                artist: streamMetadata.artist,
                title: streamMetadata.title,
            });
            setLastDebug({
                requestLine: result.requestLine,
                rawResponse: result.rawResponse,
                httpStatus: result.httpStatus,
            });
            if (result.ok) {
                setSendStatus('sent');
                setSentAt(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
                scheduleReset(5000);
            } else {
                setSendStatus('error');
                setErrorMsg(result.error || 'errore sconosciuto');
                scheduleReset(10000);
            }
        } catch (err) {
            // Senza catch una rejection IPC lasciava il pannello bloccato su "sending"
            setSendStatus('error');
            setErrorMsg(`Errore IPC: ${(err as Error).message || 'sconosciuto'}`);
            scheduleReset(10000);
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
                    <label className="text-deco-brassLabel uppercase font-ui font-semibold tracking-[2px] text-[10px] w-14 shrink-0 text-right">Artist</label>
                    <input
                        type="text"
                        placeholder="Artista / DJ"
                        value={streamMetadata.artist}
                        onChange={(e) => setStreamMetadata({ artist: e.target.value })}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-deco-bg border border-deco-brass/30 rounded-[3px] px-2 py-1.5 text-deco-ink text-sm focus:border-deco-brass focus:outline-none"
                    />
                    <label className="text-deco-brass text-sm shrink-0">—</label>
                    <input
                        type="text"
                        placeholder="Titolo brano"
                        value={streamMetadata.title}
                        onChange={(e) => setStreamMetadata({ title: e.target.value })}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-deco-bg border border-deco-brass/30 rounded-[3px] px-2 py-1.5 text-deco-ink text-sm focus:border-deco-brass focus:outline-none"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!isStreaming || sendStatus === 'sending'}
                        title={isStreaming ? 'Invia metadati al server (Invio)' : 'Avvia lo stream per inviare'}
                        className={`px-3 py-1.5 rounded-[2px] text-xs font-bold uppercase tracking-[1px] transition-all shrink-0 ${
                            isStreaming
                                ? 'bg-deco-success hover:brightness-110 text-deco-bg cursor-pointer'
                                : 'bg-deco-panel2 text-deco-inkDim border border-deco-brass/20 cursor-not-allowed'
                        } ${sendStatus === 'sending' ? 'opacity-60' : ''}`}
                    >
                        {sendStatus === 'sending' ? '...' : 'Invia'}
                    </button>
                </div>

                {/* Send status feedback */}
                {sendStatus === 'sent' && (
                    <p className="text-deco-success text-xs text-right pr-1">✓ Inviato alle {sentAt}</p>
                )}
                {sendStatus === 'error' && (
                    <p className="text-deco-onair text-xs bg-deco-onair/10 border border-deco-onair/40 rounded-[3px] px-2 py-1.5">
                        ✗ {errorMsg}
                    </p>
                )}
                {!isStreaming && (
                    <p className="text-deco-inkDim text-xs text-right pr-1">
                        I metadati verranno inviati automaticamente all'avvio dello stream.
                    </p>
                )}

                {lastDebug && (
                    <div className="mt-2">
                        <button
                            onClick={() => setShowDebug((v) => !v)}
                            className="text-deco-brass hover:text-deco-inkStrong text-xs underline"
                        >
                            {showDebug ? '▼' : '▶'} Dettagli risposta server (HTTP {lastDebug.httpStatus ?? '?'})
                        </button>
                        {showDebug && (
                            <div className="mt-1 bg-deco-bg border border-deco-brass/25 rounded-[3px] p-2 font-mono text-[10px] text-deco-inkDim max-h-48 overflow-auto">
                                <div className="text-deco-brassLabel uppercase mb-1">Request</div>
                                <pre className="whitespace-pre-wrap break-all">{lastDebug.requestLine || '—'}</pre>
                                <div className="text-deco-brassLabel uppercase mt-2 mb-1">Raw response</div>
                                <pre className="whitespace-pre-wrap break-all">{lastDebug.rawResponse || '(vuoto)'}</pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NowPlayingPanel;
