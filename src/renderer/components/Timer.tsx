import { useEffect, useState, useRef } from 'react';

interface TimerProps {
    isRunning: boolean;
}

const Timer = ({ isRunning }: TimerProps) => {
    const [seconds, setSeconds] = useState(0);
    const startTimeRef = useRef<number | null>(null);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;

        if (isRunning) {
            // Nuova sessione: riparte da zero
            startTimeRef.current = Date.now();

            const tick = () => {
                const now = Date.now();
                // Calcoliamo i secondi reali passati (timestamp difference) per evitare drift
                const diff = Math.floor((now - startTimeRef.current!) / 1000);
                setSeconds(diff);
            };
            // Primo aggiornamento asincrono (azzera il display senza setState
            // sincrono nel corpo dell'effect), poi tick ogni 500ms per reattività.
            const immediate = setTimeout(tick, 0);
            interval = setInterval(tick, 500);
            return () => {
                clearTimeout(immediate);
                clearInterval(interval);
            };
        } else {
            // Quando si ferma NON azzeriamo: la durata dell'ultima sessione resta
            // visibile (utile dopo un drop per sapere quanto si è stati in onda).
            startTimeRef.current = null;
        }

        return () => clearInterval(interval);
    }, [isRunning]);

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col items-center gap-2">
            <span className="font-ui font-semibold text-[11px] tracking-[6px] text-deco-brass uppercase">
                ◆ Session ◆
            </span>
            <div
                className={`font-display text-[76px] leading-none text-deco-inkStrong transition-opacity duration-300 ${isRunning ? 'opacity-100' : 'opacity-55'}`}
                style={{ letterSpacing: '6px' }}
            >
                {formatTime(seconds)}
            </div>
        </div>
    );
};

export default Timer;
