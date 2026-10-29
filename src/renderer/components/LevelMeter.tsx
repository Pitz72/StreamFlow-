import { type RefObject } from 'react';

interface LevelMeterProps {
    label: string;
    active: boolean;
    /**
     * Ref alla copertura della parte spenta: la scrive direttamente il loop rAF
     * (useAudioVisualizer / useMixEngine via setLevel), senza re-render React.
     */
    coverRef: RefObject<HTMLDivElement | null>;
}

// Verde fino a circa -6 dB, ambra fino a -2, rosso in cima: la scala resta ferma,
// si scopre e si copre (vedi setLevel).
const SCALE = 'linear-gradient(to right, #3FD69B 0%, #3FD69B 70%, #F2B33D 70%, #F2B33D 88%, #E5483A 88%, #E5483A 100%)';

/** Barra di livello orizzontale, una per canale (stile Live Machine Pro). */
const LevelMeter = ({ label, active, coverRef }: LevelMeterProps) => (
    <div className={`flex items-center gap-4 transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-60'}`}>
        <span className="w-5 font-mono font-extrabold text-lg text-sf-inkDim" aria-hidden="true">{label}</span>
        {/* Solo visivo: un livello che cambia 60 volte al secondo non si legge a voce. */}
        <div
            aria-hidden="true"
            className="relative flex-1 h-[22px] rounded-full overflow-hidden"
            style={{ background: SCALE }}
        >
            <div
                ref={coverRef}
                className="absolute inset-0 bg-sf-track"
                style={{ transformOrigin: '100% 50%', transform: 'scaleX(1)', transition: 'transform 60ms linear' }}
            />
        </div>
    </div>
);

export default LevelMeter;
