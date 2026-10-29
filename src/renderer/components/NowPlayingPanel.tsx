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
        <div className="flex flex-col gap-4 p-7">
            {/* Artista + Titolo — il protocollo Icecast updinfo invia un solo campo
                "song" nella forma "Artista - Titolo", quindi non serve una terza voce. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <label htmlFor="np-artist" className="sf-label">Artista o DJ</label>
                    <input
                        id="np-artist"
                        type="text"
                        placeholder="Es. Simone Pizzi"
                        value={streamMetadata.artist}
                        onChange={(e) => setStreamMetadata({ artist: e.target.value })}
                        onKeyDown={handleKeyDown}
                        className="sf-field"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label htmlFor="np-title" className="sf-label">Titolo</label>
                    <input
                        id="np-title"
                        type="text"
                        placeholder="Es. il nome del programma"
                        value={streamMetadata.title}
                        onChange={(e) => setStreamMetadata({ title: e.target.value })}
                        onKeyDown={handleKeyDown}
                        className="sf-field"
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] text-sf-inkDim">
                    {isStreaming
                        ? 'Invio per mandarli subito al player.'
                        : "Partono da soli quando vai in onda."}
                </p>
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={!isStreaming || sendStatus === 'sending'}
                    title={isStreaming ? 'Invia i metadati al server (Invio)' : 'Vai in onda per inviarli'}
                    className={`h-12 px-7 rounded-xl text-[15px] font-extrabold uppercase tracking-[0.08em] border transition-[filter] ${
                        isStreaming
                            ? 'bg-sf-greenStrong border-sf-green text-white hover:brightness-110'
                            : 'bg-sf-raised border-sf-line text-sf-inkFaint cursor-not-allowed'
                    } ${sendStatus === 'sending' ? 'opacity-60' : ''}`}
                >
                    {sendStatus === 'sending' ? 'Invio…' : 'Invia'}
                </button>
            </div>

            {sendStatus === 'sent' && (
                <p className="text-[14px] font-semibold text-sf-green" role="status">Inviati alle {sentAt}</p>
            )}
            {sendStatus === 'error' && (
                <p className="text-[14px] text-sf-redInk bg-sf-onair/10 border border-sf-onair/50 rounded-xl px-4 py-3" role="alert">
                    Non inviati: {errorMsg}
                </p>
            )}

            {lastDebug && (
                <div>
                    <button
                        type="button"
                        onClick={() => setShowDebug((v) => !v)}
                        aria-expanded={showDebug}
                        className="text-[13px] font-semibold text-sf-inkDim hover:text-sf-ink underline"
                    >
                        {showDebug ? 'Nascondi' : 'Mostra'} i dettagli della risposta del server (HTTP {lastDebug.httpStatus ?? '?'})
                    </button>
                    {showDebug && (
                        <div className="mt-2 bg-sf-sunken border border-sf-line rounded-xl p-3 font-mono text-[12px] text-sf-inkSoft max-h-48 overflow-auto">
                            <div className="sf-label mb-1">Richiesta</div>
                            <pre className="whitespace-pre-wrap break-all">{lastDebug.requestLine || '—'}</pre>
                            <div className="sf-label mt-2 mb-1">Risposta</div>
                            <pre className="whitespace-pre-wrap break-all">{lastDebug.rawResponse || '(vuota)'}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NowPlayingPanel;
