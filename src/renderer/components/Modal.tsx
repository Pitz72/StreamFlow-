import { useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: string;
    /** false per i modali con form lunghi (es. Configurazione): un click
     *  accidentale sul backdrop non deve scartare l'input digitato. */
    closeOnBackdrop?: boolean;
}

const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-md', closeOnBackdrop = true }: ModalProps) => {
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={closeOnBackdrop ? onClose : undefined}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`${maxWidth} w-full mx-4 max-h-[90vh] flex flex-col bg-deco-surface border border-deco-brass/45 rounded-[8px]`}
                style={{ boxShadow: '0 30px 70px rgba(0,0,0,.6)' }}
            >
                <div
                    className="flex items-center justify-between px-[22px] py-4 border-b border-deco-brass/35 shrink-0"
                    style={{ background: 'linear-gradient(rgba(200,164,78,.08), transparent)' }}
                >
                    <h2 className="font-display text-[20px] tracking-[3px] text-deco-inkStrong">{title}</h2>
                    <button
                        onClick={onClose}
                        title="Chiudi (Esc)"
                        className="text-deco-brass hover:text-deco-inkStrong text-xl font-bold w-8 h-8 flex items-center justify-center rounded-[2px] hover:bg-deco-brass/10 transition-colors"
                    >
                        ✕
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-[22px]">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
