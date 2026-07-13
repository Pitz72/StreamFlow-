import { type RefObject } from 'react';

interface VuMeterProps {
    label: string;
    active: boolean;
    /**
     * Ref alla barra di riempimento: l'altezza viene scritta direttamente dal
     * loop rAF in useAudioVisualizer (nessun re-render React per frame).
     */
    barRef: RefObject<HTMLDivElement | null>;
}

const VuMeter = ({ label, active, barRef }: VuMeterProps) => {
    return (
        <div className="flex flex-col items-center gap-2">
            <div className={`relative w-8 h-64 bg-stone-800 rounded-full overflow-hidden border shadow-inner transition-all duration-300 ${active ? 'border-stone-600' : 'border-stone-800'}`}>
                {/* Background segments */}
                <div className={`absolute inset-0 flex flex-col-reverse transition-opacity duration-300 ${active ? 'opacity-25' : 'opacity-10'}`}>
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className={`h-[5%] w-full border-b border-stone-900 ${i > 15 ? 'bg-red-500' : i > 12 ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                    ))}
                </div>

                {/* Active Level — altezza guidata via ref dal loop audio (no state) */}
                <div
                    ref={barRef}
                    className="absolute bottom-0 w-full"
                    style={{ height: '0%' }}
                >
                    <div className={`w-full h-full bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 transition-opacity duration-300 ${active ? 'opacity-90' : 'opacity-40'}`}></div>
                </div>
            </div>
            <span className={`font-bold transition-colors duration-300 ${active ? 'text-stone-400' : 'text-stone-600'}`}>{label}</span>
        </div>
    );
};

export default VuMeter;
