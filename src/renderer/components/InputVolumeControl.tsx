import { useStore } from '../store/useStore';

const InputVolumeControl = () => {
    const { streamConfig, setStreamConfig } = useStore();

    const gain = parseInt(streamConfig.inputGain || '100', 10);
    const overGain = gain > 100;

    return (
        <div className="flex flex-col gap-2 w-full max-w-md bg-stone-900/60 border border-stone-800 rounded-xl px-5 py-3">
            <div className="flex items-center justify-between">
                <label htmlFor="input-volume" className="text-stone-500 uppercase text-xs font-bold tracking-wider">
                    Input Volume
                </label>
                <span className={`text-xs font-mono tabular-nums ${overGain ? 'text-orange-400' : 'text-stone-300'}`}>
                    {gain}%
                </span>
            </div>
            <input
                id="input-volume"
                type="range"
                min="0"
                max="200"
                step="5"
                value={streamConfig.inputGain}
                onChange={(e) => setStreamConfig({ inputGain: e.target.value })}
                className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-stone-600 text-[10px] font-mono">
                <span>0</span>
                <span>100</span>
                <span>200</span>
            </div>
            <p className="text-stone-600 text-[10px] leading-tight">
                Applicato al prossimo avvio dello stream (FFmpeg non ricarica i filtri a caldo).
            </p>
        </div>
    );
};

export default InputVolumeControl;
