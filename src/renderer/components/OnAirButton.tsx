type StreamStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

interface OnAirButtonProps {
    isOn: boolean;
    onClick: () => void;
    disabled?: boolean;
    /** Stato di streaming: puramente presentazionale, determina il look del
     *  pulsante (live / idle / connecting / reconnecting). L'azione resta onClick. */
    status?: StreamStatus;
}

/**
 * Il pulsante della diretta: largo quanto la colonna centrale e alto 96 px, con
 * la scritta dell'azione che fa (non dello stato), così si legge da lontano e
 * non si sbaglia bersaglio.
 */
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

    const look: Record<typeof mode, { label: string; cls: string }> = {
        live: {
            label: 'Chiudi la diretta',
            cls: 'bg-sf-onair border border-sf-onairEdge text-white hover:brightness-110',
        },
        connecting: {
            label: 'Collegamento in corso…',
            cls: 'bg-sf-surface border-2 border-sf-amber text-sf-amberInk',
        },
        reconnecting: {
            label: 'Annulla la riconnessione',
            cls: 'bg-sf-surface border-2 border-sf-amber text-sf-amberInk hover:bg-sf-raised',
        },
        idle: {
            label: 'Vai in onda',
            cls: 'bg-sf-greenStrong border border-sf-green text-white hover:brightness-110',
        },
    };
    const l = look[mode];

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`w-full h-24 rounded-[20px] font-sans font-black text-[30px] uppercase tracking-[0.1em] transition-[filter,background-color] duration-200 ${l.cls} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer active:scale-[0.99]'}`}
        >
            {l.label}
        </button>
    );
};

export default OnAirButton;
