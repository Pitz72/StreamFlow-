interface OnAirButtonProps {
    isOn: boolean;
    onClick: () => void;
    disabled?: boolean;
}

const OnAirButton = ({ isOn, onClick, disabled = false }: OnAirButtonProps) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
        w-48 h-48 rounded-full border-8 transition-all duration-300 transform shadow-2xl flex items-center justify-center
        ${disabled
                    ? 'bg-stone-800 border-stone-700 opacity-50 cursor-not-allowed'
                    : isOn
                        ? 'bg-red-600 border-red-800 shadow-[0_0_50px_rgba(220,38,38,0.6)] animate-pulse active:scale-95'
                        : 'bg-stone-800 border-stone-700 shadow-stone-900/50 hover:bg-stone-700 active:scale-95'
                }
      `}
        >
            <div className="flex flex-col items-center">
                <span className={`text-3xl font-black tracking-tighter ${isOn && !disabled ? 'text-white' : 'text-stone-500'}`}>
                    {disabled ? '...' : 'GO'}
                </span>
                <span className={`text-4xl font-black tracking-tighter ${isOn && !disabled ? 'text-white' : 'text-stone-400'}`}>
                    {disabled ? 'WAIT' : 'ON AIR'}
                </span>
            </div>
        </button>
    );
};

export default OnAirButton;
