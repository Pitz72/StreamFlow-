import { useEffect, useState } from 'react';

interface TimerProps {
    isRunning: boolean;
}

const Timer = ({ isRunning }: TimerProps) => {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isRunning) {
            interval = setInterval(() => {
                setSeconds(s => s + 1);
            }, 1000);
        } else {
            // Optional: Reset on stop? Or pause?
            // For this requirement "00:00:00" suggests reset or start from 0.
            // Let's reset for now when stopped, or keep it paused.
            // User requirement is just "Un grande timer '00:00:00'".
            if (!isRunning && seconds > 0) {
                setSeconds(0);
            }
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
