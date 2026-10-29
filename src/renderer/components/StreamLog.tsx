import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

const levelColors: Record<string, string> = {
    info: 'text-sf-inkSoft',
    success: 'text-sf-green',
    error: 'text-sf-redInk',
};

// Da dove arriva l'evento: diretta, metadati, programma.
const sourceName: Record<string, string> = {
    stream: 'Diretta',
    metadata: 'Metadati',
    system: 'Sistema',
};
const sourceInk: Record<string, string> = {
    stream: 'text-sf-green',
    metadata: 'text-sf-violetInk',
    system: 'text-sf-cyanInk',
};

const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

const StreamLog = () => {
    const { logEvents, clearLog } = useStore();
    const [expanded, setExpanded] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Autoscroll quando arriva un evento (solo se siamo già in fondo)
    useEffect(() => {
        if (!scrollRef.current) return;
        const el = scrollRef.current;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        if (nearBottom) {
            el.scrollTop = el.scrollHeight;
        }
    }, [logEvents]);

    const last = logEvents[logEvents.length - 1];

    return (
        <div className="shrink-0 bg-sf-sunken border-t border-sf-line relative z-10">
            {/* Barra chiusa: ultimo evento + pulsanti */}
            <div className="h-12 flex items-center gap-4 px-7">
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="h-8 px-3 rounded-lg border border-sf-lineStrong text-[13px] font-bold text-sf-inkSoft hover:text-sf-ink hover:bg-sf-raised shrink-0 inline-flex items-center gap-2"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d={expanded ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
                    </svg>
                    Registro eventi
                    <span className="font-mono text-sf-inkFaint">{logEvents.length}</span>
                </button>
                <div className="flex-1 min-w-0 text-[13px] font-mono truncate">
                    {last ? (
                        <>
                            <span className="text-sf-inkFaint">{fmtTime(last.ts)}</span>
                            <span className={`ml-3 font-bold uppercase text-[11px] tracking-[0.08em] ${sourceInk[last.source]}`}>
                                {sourceName[last.source]}
                            </span>
                            <span className={`ml-3 ${levelColors[last.level]}`}>{last.message}</span>
                        </>
                    ) : (
                        <span className="text-sf-inkFaint">nessun evento</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={clearLog}
                    disabled={logEvents.length === 0}
                    className="h-8 px-3 rounded-lg text-[13px] font-bold text-sf-inkDim hover:text-sf-ink hover:bg-sf-raised disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    title="Svuota il registro a video (il file di log resta)"
                >
                    Svuota
                </button>
            </div>

            {/* Aperto: lista completa scorrevole */}
            {expanded && (
                <div
                    ref={scrollRef}
                    className="max-h-64 overflow-y-auto px-7 py-3 border-t border-sf-line font-mono text-[13px] bg-sf-bg"
                >
                    {logEvents.length === 0 ? (
                        <p className="text-sf-inkFaint italic">In attesa di eventi...</p>
                    ) : (
                        logEvents.map((e) => (
                            <div key={e.id} className="py-1 flex items-start gap-3">
                                <span className="text-sf-inkFaint shrink-0">{fmtTime(e.ts)}</span>
                                <span className={`w-20 shrink-0 font-bold uppercase text-[11px] tracking-[0.08em] pt-0.5 ${sourceInk[e.source]}`}>
                                    {sourceName[e.source]}
                                </span>
                                <span className={`flex-1 break-words ${levelColors[e.level]}`}>{e.message}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default StreamLog;
