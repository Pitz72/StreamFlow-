import { useState, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

const MAX_SIZE = 1000;

function resizeImageToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const ratio = Math.min(MAX_SIZE / img.width, MAX_SIZE / img.height, 1);
            const w = Math.round(img.width * ratio);
            const h = Math.round(img.height * ratio);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas context non disponibile'));
            ctx.drawImage(img, 0, 0, w, h);
            // data URL: "data:image/jpeg;base64,..."
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            resolve(dataUrl.split(',')[1]); // solo la parte base64
        };
        img.onerror = () => reject(new Error('Impossibile caricare l\'immagine'));
        img.src = url;
    });
}

const CoverArtPanel = () => {
    const { azuraCastUrl, azuraCastApiKey, azuraCastStationId } = useStore();

    const [preview, setPreview] = useState<string | null>(null);
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [open, setOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setErrorMsg('File non valido. Usa un\'immagine (JPG, PNG, GIF, WebP).');
            setStatus('error');
            return;
        }
        setStatus('idle');
        setErrorMsg('');
        try {
            const b64 = await resizeImageToBase64(file);
            setImageBase64(b64);
            setPreview(`data:image/jpeg;base64,${b64}`);
        } catch (e) {
            setErrorMsg((e as Error).message);
            setStatus('error');
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        e.target.value = '';
    };

    const handleUpload = async () => {
        if (!imageBase64 || !azuraCastUrl || !azuraCastApiKey || azuraCastStationId === null) return;
        setStatus('uploading');
        setErrorMsg('');
        try {
            const res = await window.electronAPI.azuraCastUploadArt({
                url: azuraCastUrl,
                apiKey: azuraCastApiKey,
                stationId: azuraCastStationId,
                imageBase64,
            });
            if (res.ok) {
                setStatus('success');
            } else {
                setErrorMsg(res.error || 'Upload fallito');
                setStatus('error');
            }
        } catch (e) {
            setErrorMsg((e as Error).message);
            setStatus('error');
        }
    };

    const canUpload = !!imageBase64 && !!azuraCastUrl && !!azuraCastApiKey && azuraCastStationId !== null;
    const missingContext = !azuraCastUrl || !azuraCastApiKey || azuraCastStationId === null;

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full text-xs bg-stone-800 hover:bg-stone-700 text-purple-400 hover:text-purple-300 border border-stone-700 rounded px-3 py-2 transition-colors text-left"
            >
                Cover Art — Carica su AzuraCast
            </button>
        );
    }

    return (
        <div className="bg-stone-950 border border-purple-900/50 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Cover Art</span>
                <button onClick={() => setOpen(false)} className="text-stone-500 hover:text-stone-200 text-sm">✕</button>
            </div>

            {missingContext && (
                <p className="text-xs text-yellow-400/80 bg-yellow-950/30 border border-yellow-900/40 rounded px-2 py-1.5">
                    Configura prima la stazione tramite AzuraCast Auto-Config.
                </p>
            )}

            {!missingContext && (
                <p className="text-xs text-stone-500 font-mono truncate">
                    Stazione #{azuraCastStationId} — {azuraCastUrl}
                </p>
            )}

            {/* Drop zone */}
            <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`relative flex items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-colors
                    ${dragging ? 'border-purple-500 bg-purple-950/30' : 'border-stone-700 hover:border-stone-500 bg-stone-900/50'}
                    ${preview ? 'h-36' : 'h-24'}`}
            >
                {preview ? (
                    <img src={preview} alt="cover preview" className="h-full w-full object-contain rounded-lg" />
                ) : (
                    <span className="text-stone-500 text-xs text-center px-2">
                        Trascina un'immagine qui<br />o clicca per scegliere
                    </span>
                )}
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
            />

            {preview && (
                <button
                    onClick={() => { setPreview(null); setImageBase64(null); setStatus('idle'); setErrorMsg(''); }}
                    className="text-xs text-stone-500 hover:text-stone-300 transition-colors self-start"
                >
                    ✕ Rimuovi immagine
                </button>
            )}

            {status === 'error' && (
                <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/50 rounded px-2 py-1.5">{errorMsg}</p>
            )}
            {status === 'success' && (
                <p className="text-green-400 text-xs bg-green-950/30 border border-green-900/50 rounded px-2 py-1.5">
                    ✓ Cover art caricata con successo
                </p>
            )}

            <button
                onClick={handleUpload}
                disabled={!canUpload || status === 'uploading'}
                className="bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded px-3 py-1.5 transition-colors"
            >
                {status === 'uploading' ? 'Caricamento...' : 'Carica su AzuraCast'}
            </button>
        </div>
    );
};

export default CoverArtPanel;
