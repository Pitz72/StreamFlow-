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
            // Se partiamo da zero e non c'è uno startTime memorizzato, lo salviamo
            if (startTimeRef.current === null) {
                startTimeRef.current = Date.now();
            }

            interval = setInterval(() => {
                const now = Date.now();
                // Calcoliamo i secondi reali passati (timestamp difference) per evitare drift
                const diff = Math.floor((now - startTimeRef.current!) / 1000);
                setSeconds(diff);
            }, 500); // 500ms al posto di 1000ms fornisce maggiore reattività allo scatto visivo
        } else {
            // Quando si ferma, azzeriamo tutto
            if (seconds > 0) {
                setSeconds(0);
                startTimeRef.current = null;
            }
        }

        return () => clearInterval(interval);
    }, [isRunning, seconds]);

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="font-mono text-8xl font-bold tracking-widest text-stone-200 drop-shadow-2xl">
            {formatTime(seconds)}
        </div>
    );
};

export default Timer;
