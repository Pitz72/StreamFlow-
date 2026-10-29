import { useState } from 'react';
import Modal from './Modal';

interface UpdateDialogProps {
    isOpen: boolean;
    /** Versione già scaricata e pronta da installare. */
    version: string;
    /** "Più tardi" (anche Esc o la ✕): si installerà alla chiusura di StreamFlow. */
    onLater: () => void;
}

/**
 * Avviso di aggiornamento pronto, con la domanda esplicita: installo adesso?
 *
 * App lo apre solo fuori dalla diretta (mai sopra una sessione attiva o un
 * collegamento in corso) e quando nessun'altra finestra è aperta. Il main
 * rifiuta comunque l'installazione durante una sessione: qui il rifiuto, se
 * arriva, viene mostrato invece di sparire nel registro.
 */
const UpdateDialog = ({ isOpen, version, onLater }: UpdateDialogProps) => {
    const [installing, setInstalling] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);

    const install = async () => {
        setInstalling(true);
        setRefusal(null);
        try {
            const res = await window.electronAPI.installUpdate();
            // ok: StreamFlow si sta chiudendo per installare, la finestra sparisce con lei.
            if (!res.ok) {
                setRefusal(res.message || "Non è stato possibile avviare l'installazione.");
                setInstalling(false);
            }
        } catch {
            setRefusal("Non è stato possibile avviare l'installazione.");
            setInstalling(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onLater} title="Aggiornamento pronto" maxWidth="max-w-xl" closeOnBackdrop={false}>
            <div className="flex flex-col gap-5 p-7">
                <p className="text-[22px] font-extrabold leading-snug text-sf-ink">
                    È pronta la versione {version} di StreamFlow.
                </p>
                <p className="text-[17px] leading-relaxed text-sf-inkSoft">
                    Adesso hai la {__APP_VERSION__}. L&apos;aggiornamento è già scaricato:
                    l&apos;installazione dura pochi secondi, poi StreamFlow si riapre da solo.
                    Impostazioni e password memorizzate restano come sono.
                </p>
                <p className="text-[16px] leading-relaxed text-sf-inkDim">
                    Se scegli <strong className="text-sf-ink">Più tardi</strong>, si installa da solo
                    quando chiudi StreamFlow.
                </p>
                {refusal && (
                    <p role="alert" className="text-[15px] text-sf-redInk bg-sf-onair/10 border border-sf-onair/50 rounded-xl px-4 py-3">
                        {refusal}
                    </p>
                )}
                <div className="flex flex-wrap justify-end gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onLater}
                        disabled={installing}
                        className="h-14 px-7 rounded-xl border border-sf-lineStrong bg-sf-raised text-sf-ink text-[17px] font-bold hover:bg-sf-sunken disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                        Più tardi
                    </button>
                    <button
                        type="button"
                        autoFocus
                        onClick={() => { void install(); }}
                        disabled={installing}
                        className="h-14 px-8 rounded-xl border border-sf-green bg-sf-greenStrong text-white text-[17px] font-extrabold hover:brightness-110 disabled:opacity-60 disabled:cursor-wait"
                    >
                        {installing ? 'Installo…' : 'Installa ora'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default UpdateDialog;
