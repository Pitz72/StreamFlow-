type StreamStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

interface OnAirButtonProps {
    isOn: boolean;
    onClick: () => void;
    disabled?: boolean;
    /** Stato di streaming: puramente presentazionale, determina il look del
     *  pulsante (live / idle / connecting / reconnecting). L'azione resta onClick. */
    status?: StreamStatus;
}

const BRASS = '#C8A44E';

// Riempimenti radiali per i due stati principali del quadrante centrale.
const FILL_LIVE = 'radial-gradient(circle at 50% 35%, #E0483A, #B8302A 62%, #8F2418)';
const FILL_IDLE = 'radial-gradient(circle at 50% 35%, #183F3A, #102E2B)';

const OnAirButton = ({ isOn, onClick, disabled = false, status }: OnAirButtonProps) => {
    // Modalità visiva: preferisce lo status esplicito, con fallback su isOn/disabled.
    const mode: 'live' | 'connecting' | 'reconnecting' | 'idle' =
        status === 'connected' ? 'live'
        : status === 'connecting' ? 'connecting'
        : status === 'reconnecting' ? 'reconnecting'
        : status === 'error' || status === 'disconnected' ? 'idle'
        : disabled ? 'connecting'
        : isOn ? 'live'
        : 'idle';

    const face: Record<typeof mode, {
        top: string; bottom: string; border: string; fill: string;
        text: string; shadow: string;
    }> = {
        live: {
            top: 'GO', bottom: 'ON AIR', border: BRASS, fill: FILL_LIVE, text: '#F2EAD2',
            shadow: '0 0 40px rgba(224,72,58,.5), inset 0 3px 10px rgba(255,255,255,.3)',
        },
        connecting: {
            top: '• • •', bottom: 'WAIT', border: '#E0B23A', fill: FILL_IDLE, text: '#E0B23A',
            shadow: 'inset 0 3px 10px rgba(0,0,0,.35)',
        },
        reconnecting: {
            top: 'ANNULLA', bottom: 'riconnessione', border: '#A07A1E', fill: FILL_IDLE, text: '#E0B23A',
            shadow: 'inset 0 3px 10px rgba(0,0,0,.35)',
        },
        idle: {
            top: 'GO', bottom: 'ON AIR', border: 'rgba(200,164,78,.5)', fill: FILL_IDLE, text: 'rgba(230,221,196,.55)',
            shadow: 'inset 0 3px 10px rgba(0,0,0,.35)',
        },
    };
    const f = face[mode];

    return (
        // Cornice ottone con alone
        <div
            className="rounded-full p-2 border-2"
            style={{
                borderColor: 'rgba(200,164,78,.6)',
                boxShadow: '0 0 0 6px rgba(200,164,78,.12)',
            }}
        >
            <button
                onClick={onClick}
                disabled={disabled}
                className={`w-[140px] h-[140px] rounded-full border-[7px] flex items-center justify-center transition-all duration-300 ${disabled ? 'cursor-not-allowed' : 'active:scale-95 cursor-pointer'} ${mode === 'live' ? 'animate-pulse' : ''}`}
                style={{ borderColor: f.border, background: f.fill, boxShadow: f.shadow }}
            >
                <div className="flex flex-col items-center leading-tight" style={{ color: f.text }}>
                    <span className="font-display text-[20px] tracking-wide">{f.top}</span>
                    <span className={`font-ui font-bold ${mode === 'reconnecting' ? 'text-[13px] tracking-normal lowercase' : 'text-[24px] tracking-wider'}`}>
                        {f.bottom}
                    </span>
                </div>
            </button>
        </div>
    );
};

export default OnAirButton;
