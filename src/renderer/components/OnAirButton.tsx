interface OnAirButtonProps {
    isOn: boolean;
    onClick: () => void;
}

const OnAirButton = ({ isOn, onClick }: OnAirButtonProps) => {
    return (
        <button
            onClick={onClick}
            className={`
        w-48 h-48 rounded-full border-8 transition-all duration-300 transform active:scale-95 shadow-2xl flex items-center justify-center
        ${isOn
                    ? 'bg-red-600 border-red-800 shadow-[0_0_50px_rgba(220,38,38,0.6)] animate-pulse'
                    : 'bg-stone-800 border-stone-700 shadow-stone-900/50 hover:bg-stone-700'
                }
      `}
        >
            <div className="flex flex-col items-center">
                <span className={`text-3xl font-black tracking-tighter ${isOn ? 'text-white' : 'text-stone-500'}`}>
                    GO
                </span>
                <span className={`text-4xl font-black tracking-tighter ${isOn ? 'text-white' : 'text-stone-400'}`}>
                    ON AIR
                </span>
            </div>
        </button>
    );
};

export default OnAirButton;
