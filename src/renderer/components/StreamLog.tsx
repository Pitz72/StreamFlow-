import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

const levelColors: Record<string, string> = {
    info: 'text-stone-400',
    success: 'text-green-400',
    error: 'text-red-400',
};

const sourceBadge: Record<string, string> = {
    stream: 'bg-blue-900/60 text-blue-300',
    metadata: 'bg-purple-900/60 text-purple-300',
    system: 'bg-stone-800 text-stone-400',
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
        <div className="shrink-0 bg-stone-900 border-t-2 border-stone-700 relative z-10">
            {/* Bar collapsed: mostra ultimo evento + bottoni */}
            <div className="flex items-center gap-3 px-4 py-2">
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="text-stone-500 hover:text-stone-200 text-xs font-bold uppercase tracking-wider shrink-0 transition-colors"
                    title={expanded ? 'Comprimi log' : 'Espandi log'}
                >
                    {expanded ? '▼' : '▲'} Log
                </button>
                <span className="text-stone-600 text-xs">[{logEvents.length}]</span>
                <div className="flex-1 min-w-0 text-xs font-mono truncate">
                    {last ? (
                        <>
                            <span className="text-stone-600">{fmtTime(last.ts)}</span>
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase ${sourceBadge[last.source]}`}>
                                {last.source}
                            </span>
                            <span className={`ml-2 ${levelColors[last.level]}`}>{last.message}</span>
                        </>
                    ) : (
                        <span className="text-stone-600">nessun evento</span>
                    )}
                </div>
                <button
                    onClick={clearLog}
                    disabled={logEvents.length === 0}
                    className="text-stone-500 hover:text-stone-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs px-2 py-0.5 rounded hover:bg-stone-800 transition-colors shrink-0"
                    title="Cancella log"
                >
                    Clear
                </button>
            </div>

            {/* Expanded: lista completa scrollabile */}
            {expanded && (
                <div
                    ref={scrollRef}
                    className="max-h-64 overflow-y-auto px-4 py-2 border-t border-stone-800 font-mono text-xs bg-stone-950/60"
                >
                    {logEvents.length === 0 ? (
                        <p className="text-stone-600 italic">In attesa di eventi...</p>
                    ) : (
                        logEvents.map((e) => (
                            <div key={e.id} className="py-0.5 flex items-start gap-2">
                                <span className="text-stone-600 shrink-0">{fmtTime(e.ts)}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase shrink-0 ${sourceBadge[e.source]}`}>
                                    {e.source}
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
