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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
            onClick={closeOnBackdrop ? onClose : undefined}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                className={`${maxWidth} w-full mx-6 max-h-[90vh] flex flex-col bg-sf-surface border border-sf-lineStrong rounded-[20px] shadow-2xl overflow-hidden`}
            >
                <div className="h-[72px] shrink-0 flex items-center justify-between px-7 border-b border-sf-line">
                    <h2 className="text-[20px] font-extrabold text-sf-ink">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Chiudi"
                        title="Chiudi (Esc)"
                        className="w-10 h-10 rounded-xl border border-sf-lineStrong bg-sf-raised text-sf-inkSoft hover:text-sf-ink flex items-center justify-center"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M6 6l12 12 M18 6 6 18" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
