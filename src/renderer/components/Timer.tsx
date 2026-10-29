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

    // Grande, con cifre a larghezza fissa: si legge da lontano e non balla.
    // Inter e non il monospazio: a questa misura lo zero puntato di JetBrains
    // Mono disturba la lettura.
    return (
        <div
            role="timer"
            aria-label="Durata della diretta"
            className={`font-sans font-extrabold leading-[0.9] tabular-nums transition-colors duration-300 ${isRunning ? 'text-sf-ink' : 'text-sf-inkFaint'}`}
            style={{ fontSize: 'clamp(72px, 17vh, 150px)', letterSpacing: '-0.03em' }}
        >
            {formatTime(seconds)}
        </div>
    );
};

export default Timer;
