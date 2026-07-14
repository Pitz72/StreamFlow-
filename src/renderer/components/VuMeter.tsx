import { type RefObject } from 'react';

interface VuMeterProps {
    label: string;
    active: boolean;
    /**
     * Ref alla lancetta (<rect> SVG): la rotazione viene scritta direttamente
     * dal loop rAF in useAudioVisualizer (nessun re-render React per frame).
     * L'animazione CSS nei mock è solo dimostrativa: qui l'ago è pilotato
     * dal livello audio reale.
     */
    barRef: RefObject<SVGRectElement | null>;
}

/**
 * VU meter analogico ad ago (stile "Deco Dial"). Quadrante SVG con arco scala,
 * zona rossa, tacche e lancetta. I colori seguono le variabili di tema
 * (--deco-vu-*): la faccia resta chiara in entrambi i temi, come un vero VU.
 */
const VuMeter = ({ label, active, barRef }: VuMeterProps) => {
    const glowId = `vu-glow-${label}`;
    return (
        <div className={`flex flex-col items-center gap-2 transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-40'}`}>
            <div
                className="relative rounded-[10px] p-[9px]"
                style={{
                    background: 'var(--deco-vu-bezel)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), inset 0 -2px 6px rgba(0,0,0,.4), 0 3px 8px rgba(0,0,0,.35)',
                }}
            >
                <svg
                    viewBox="0 0 240 150"
                    width="184"
                    height="115"
                    style={{
                        display: 'block',
                        borderRadius: '6px',
                        background: 'var(--deco-vu-face)',
                        boxShadow: 'inset 0 0 22px rgba(0,0,0,.22)',
                    }}
                >
                    <defs>
                        <radialGradient id={glowId} cx="50%" cy="95%" r="75%">
                            <stop offset="0%" stopColor="var(--deco-vu-glow)" stopOpacity="0.55" />
                            <stop offset="100%" stopColor="var(--deco-vu-glow)" stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    <rect x="0" y="0" width="240" height="150" fill={`url(#${glowId})`} />

                    {/* Arco scala + zona rossa */}
                    <path d="M53.8 74.1 A92 92 0 0 1 186.2 74.1" fill="none" stroke="var(--deco-vu-ink)" strokeWidth="2" strokeLinecap="round" />
                    <path d="M151.5 51.6 A92 92 0 0 1 186.2 74.1" fill="none" stroke="var(--deco-vu-red)" strokeWidth="4" strokeLinecap="round" />

                    {/* Tacche scala (le ultime 3 in rosso) */}
                    <g stroke="var(--deco-vu-ink)" strokeWidth="1.6">
                        <g transform="rotate(-45 120 138)"><line x1="120" y1="43" x2="120" y2="53" /></g>
                        <g transform="rotate(-35 120 138)"><line x1="120" y1="44" x2="120" y2="52" /></g>
                        <g transform="rotate(-25 120 138)"><line x1="120" y1="44" x2="120" y2="52" /></g>
                        <g transform="rotate(-15 120 138)"><line x1="120" y1="44" x2="120" y2="52" /></g>
                        <g transform="rotate(-5 120 138)"><line x1="120" y1="43" x2="120" y2="53" /></g>
                        <g transform="rotate(5 120 138)"><line x1="120" y1="44" x2="120" y2="52" /></g>
                        <g transform="rotate(15 120 138)"><line x1="120" y1="44" x2="120" y2="52" /></g>
                    </g>
                    <g stroke="var(--deco-vu-red)" strokeWidth="1.8">
                        <g transform="rotate(25 120 138)"><line x1="120" y1="43" x2="120" y2="53" /></g>
                        <g transform="rotate(35 120 138)"><line x1="120" y1="43" x2="120" y2="53" /></g>
                        <g transform="rotate(45 120 138)"><line x1="120" y1="42" x2="120" y2="54" /></g>
                    </g>

                    <text x="66" y="112" fontFamily="Oswald, sans-serif" fontSize="13" letterSpacing="2" fill="var(--deco-vu-ink)" opacity="0.75">VU</text>
                    <text x="150" y="112" fontFamily="Oswald, sans-serif" fontSize="13" letterSpacing="1" fill="var(--deco-vu-red)" opacity="0.85">+3</text>

                    {/* Lancetta — pilotata via barRef dal loop audio (transform rotate). */}
                    <rect
                        ref={barRef}
                        x="118.5"
                        y="50"
                        width="3"
                        height="88"
                        rx="1.5"
                        fill="var(--deco-vu-needle)"
                        style={{
                            transformBox: 'fill-box',
                            transformOrigin: '50% 100%',
                            transform: 'rotate(-42deg)',
                            transition: 'transform 60ms linear',
                        }}
                    />
                    <circle cx="120" cy="138" r="9" fill="var(--deco-vu-needle)" />
                    <circle cx="120" cy="138" r="4" fill="var(--deco-vu-face)" opacity="0.5" />
                </svg>
            </div>
            <span className="font-ui font-semibold text-[13px] tracking-[3px] text-deco-brass">{label}</span>
        </div>
    );
};

export default VuMeter;
