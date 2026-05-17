import { useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: string;
}

const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }: ModalProps) => {
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
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`${maxWidth} w-full mx-4 max-h-[90vh] flex flex-col bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl`}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 shrink-0">
                    <h2 className="text-lg font-bold text-stone-200">{title}</h2>
                    <button
                        onClick={onClose}
                        title="Chiudi (Esc)"
                        className="text-stone-500 hover:text-stone-200 text-xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-stone-800 transition-colors"
                    >
                        ✕
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
