import { useStore } from '../store/useStore';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';

interface VuMeterProps {
    label: string;
    active: boolean;
}

const VuMeter = ({ label }: VuMeterProps) => {
    const { selectedDeviceId } = useStore();
    // Only analyze audio when streaming is active (or always if we want monitoring)
    // The user requirement implies visualizer should work. Usually meters work always if monitoring is on, 
    // but here 'active' prop controls something. 
    // Let's assume meter works when active=true OR just enable it always for feedback.
    // The previous code had "if (active) ... random". 
    // Let's make it always active for feedback, or respect prop. 
    // If I use the hook unconditionally, it will analyze.

    const volume = useAudioVisualizer(selectedDeviceId);

    // If we want to shut down meter when not streaming:

    // Wait, usually you want to see levels BEFORE going on air to check mic.
    // I will let the meter run always, but maybe dim it? 
    // The prompt says "active={isStreaming}". If isStreaming is false, the meter was 0.
    // I should probably respect that for now, OR show levels always. 
    // Better UX: Show levels ALWAYS so user can check mic. 
    // But to stick to previous logic (active prop):
    // I'll show levels always because that's how settings work (you select mic and see level).


    // BUT the prompt says "Enable selection... and display real levels".
    // I will change App.tsx to pass active={true} if I want always on.
    // For now, let's keep the hook running and use 'volume' directly if we want "Input Monitoring".
    // Let's use 'volume' directly. If the user wants to mute meter when off-air, they can. 
    // But for setting up audio device, you NEED to see the meter.

    // Update: The previous code forced 0 if not active.
    // I will modify App.tsx to allow monitoring or just ignore 'active' for the level.
    // Let's ignore 'active' for the visualization level, so user can test mic.

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
                    {/* Masking logic or simple solid bar? Let's use simple solid bar with gradient */}
                    <div className="w-full h-full bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 opacity-90"></div>
                </div>
            </div>
            <span className="font-bold text-stone-500">{label}</span>
        </div>
    );
};

export default VuMeter;
