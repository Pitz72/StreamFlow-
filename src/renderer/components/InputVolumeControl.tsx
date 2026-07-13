import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

const InputVolumeControl = () => {
    const { streamConfig, setStreamConfig, isStreaming, streamStatus } = useStore();

    const gain = parseInt(streamConfig.inputGain || '100', 10);
    const overGain = gain > 100;
    const live = isStreaming || streamStatus === 'reconnecting';

    // true = l'ultima modifica è stata applicata in diretta (feedback UI).
    const [liveApplied, setLiveApplied] = useState<boolean | null>(null);
    // Throttle degli invii ZMQ mentre si trascina lo slider (loopback, ma evitiamo
    // di floodare): al massimo un invio ogni ~80ms + un invio finale garantito.
    const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRef = useRef<number | null>(null);

    useEffect(() => {
        return () => { if (throttleRef.current) clearTimeout(throttleRef.current); };
    }, []);

    const pushLive = async (pct: number) => {
        if (!window.electronAPI?.setInputGain) return;
        try {
            const res = await window.electronAPI.setInputGain(pct);
            setLiveApplied(res.appliedLive);
        } catch {
            setLiveApplied(false);
        }
    };

    const handleChange = (raw: string) => {
        setStreamConfig({ inputGain: raw });
        if (!live) return;
        const pct = parseInt(raw, 10);
        if (!Number.isFinite(pct)) return;

        // Throttle: invia subito il primo, poi al più uno ogni 80ms, e sempre l'ultimo.
        pendingRef.current = pct;
        if (throttleRef.current) return;
        pushLive(pct);
        pendingRef.current = null;
        throttleRef.current = setTimeout(() => {
            throttleRef.current = null;
            if (pendingRef.current !== null) {
                pushLive(pendingRef.current);
                pendingRef.current = null;
            }
        }, 80);
    };

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
                onChange={(e) => handleChange(e.target.value)}
                className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-stone-600 text-[10px] font-mono">
                <span>0</span>
                <span>100</span>
                <span>200</span>
            </div>
            {live ? (
                liveApplied === false ? (
                    <p className="text-amber-500/80 text-[10px] leading-tight">
                        Canale live non disponibile: il valore si applicherà al prossimo avvio dello stream.
                    </p>
                ) : (
                    <p className="text-green-500/80 text-[10px] leading-tight">
                        ● In diretta — la regolazione ha effetto immediato sullo stream.
                    </p>
                )
            ) : (
                <p className="text-stone-600 text-[10px] leading-tight">
                    Verrà applicato all'avvio dello stream, poi regolabile in diretta.
                </p>
            )}
        </div>
    );
};

export default InputVolumeControl;
