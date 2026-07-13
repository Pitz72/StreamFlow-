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
        <div className="font-mono text-8xl font-bold tracking-widest text-stone-200 drop-shadow-2xl">
            {formatTime(seconds)}
        </div>
    );
};

export default Timer;
