import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../store/useStore';

const InputVolumeControl = () => {
    const { streamConfig, setStreamConfig, isStreaming, streamStatus, mixMode } = useStore();

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
        // MIX MODE: il guadagno lo applica il mixer del renderer, che legge lo
        // store. FFmpeg non ha il filtro azmq e rispondeva "non applicato": il
        // pannello mostrava "si applicherà al prossimo avvio", che era falso.
        if (!live || mixMode) return;
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

    // Percentuale di riempimento della track (range 0-200 → 0-100%).
    const fillPct = `${(Math.min(200, Math.max(0, gain)) / 200) * 100}%`;

    const hint = live
        ? (liveApplied === false && !mixMode
            ? { text: 'Vale dal prossimo avvio', title: 'Il canale per regolare il volume in diretta non risponde: il valore si applicherà al prossimo avvio della diretta.', cls: 'text-sf-amberInk' }
            : { text: 'Effetto immediato', title: 'In diretta: la regolazione arriva subito allo stream.', cls: 'text-sf-green' })
        : { text: "Vale dall'avvio", title: 'Si applica quando vai in onda; poi si regola anche in diretta.', cls: 'text-sf-inkDim' };

    return (
        <div className="flex items-center gap-4 flex-1 min-w-[320px] h-14 px-5 rounded-2xl bg-sf-surface border border-sf-lineStrong">
            <label htmlFor="input-volume" className="text-[15px] font-bold text-sf-ink shrink-0">
                Volume microfono
            </label>
            <input
                id="input-volume"
                type="range"
                min="0"
                max="200"
                step="5"
                value={streamConfig.inputGain}
                onChange={(e) => handleChange(e.target.value)}
                aria-valuetext={`${gain} per cento`}
                className="sf-slider flex-1 min-w-[120px]"
                style={{ '--sf-fill': fillPct } as CSSProperties}
            />
            <span className={`w-16 text-right font-mono font-bold text-[17px] tabular-nums ${overGain ? 'text-sf-amberInk' : 'text-sf-ink'}`}>
                {gain} %
            </span>
            <span title={hint.title} className={`text-[13px] font-semibold shrink-0 ${hint.cls}`}>{hint.text}</span>
        </div>
    );
};

export default InputVolumeControl;
