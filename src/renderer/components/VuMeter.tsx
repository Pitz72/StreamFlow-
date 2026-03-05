import { useStore } from '../store/useStore';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';

interface VuMeterProps {
    label: string;
    active: boolean;
}

const VuMeter = ({ label }: VuMeterProps) => {
    const { selectedDeviceId } = useStore();
    // VU Meter always active for input monitoring (allows mic check before going ON AIR)
    const volume = useAudioVisualizer(selectedDeviceId);

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative w-8 h-64 bg-stone-800 rounded-full overflow-hidden border border-stone-700 shadow-inner">
                {/* Background segments */}
                <div className="absolute inset-0 flex flex-col-reverse opacity-20">
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className={`h-[5%] w-full border-b border-stone-900 ${i > 15 ? 'bg-red-500' : i > 12 ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                    ))}
                </div>

                {/* Active Level */}
                <div
                    className="absolute bottom-0 w-full transition-all duration-75 ease-out bg-stone-900/0"
                    style={{ height: `${volume}%` }}
                >
                    <div className="w-full h-full bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 opacity-90"></div>
                </div>
            </div>
            <span className="font-bold text-stone-500">{label}</span>
        </div>
    );
};

export default VuMeter;
