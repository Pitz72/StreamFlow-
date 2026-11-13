import { BrowserWindow, Notification, nativeImage, type NativeImage } from 'electron';

/**
 * Avvisi che si vedono anche quando StreamFlow non è la finestra davanti
 * (vedi `alert-policy.ts` per il quando). Tre segnali, nessun suono:
 *
 * 1. il pulsante di StreamFlow sulla barra delle applicazioni: pallino e fondo
 *    ambra finché c'è un problema in corso, rossi quando non si è più in onda;
 * 2. lo stesso pulsante che lampeggia, finché non si torna su StreamFlow;
 * 3. una notifica di Windows, che per «Non sei in onda» resta finché non la si chiude.
 *
 * Niente suoni per scelta: in MIX MODE ogni suono del computer va in onda, e con
 * un mixer USB che riceve l'audio del PC succede lo stesso.
 *
 * Regola comune: nessuna di queste chiamate può far cadere il programma. Un
 * avviso non riuscito si perde, la diretta no.
 */

export type AlertLevel = 'warning' | 'critical';

let win: BrowserWindow | null = null;
let taskbar: AlertLevel | null = null;
/** Il riferimento tiene viva la notifica: senza, sparisce prima del clic. */
let toast: Notification | null = null;

/** Pallino pieno 32×32 (BGRA premoltiplicato, il formato di Windows), bordo sfumato. */
const dot = (r: number, g: number, b: number): NativeImage => {
    const size = 32;
    const buf = Buffer.alloc(size * size * 4);
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const a = Math.max(0, Math.min(1, size / 2 - 1 - Math.hypot(x - c, y - c) + 0.5));
            const i = (y * size + x) * 4;
            buf[i] = Math.round(b * a);
            buf[i + 1] = Math.round(g * a);
            buf[i + 2] = Math.round(r * a);
            buf[i + 3] = Math.round(255 * a);
        }
    }
    return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 });
};

let dots: Record<AlertLevel, NativeImage> | null = null;
const dotFor = (level: AlertLevel) => {
    // Gli stessi rosso e ambra dell'interfaccia. Creati al primo uso: prima di
    // app.whenReady nativeImage non è garantito.
    if (!dots) dots = { warning: dot(0xF2, 0xB3, 0x3D), critical: dot(0xE5, 0x48, 0x3A) };
    return dots[level];
};

const alive = () => win !== null && !win.isDestroyed();

/** La finestra è quella su cui si sta lavorando: chi trasmette la sta guardando. */
const inFront = () => alive() && win!.isFocused() && !win!.isMinimized();

const setTaskbar = (level: AlertLevel | null) => {
    taskbar = level;
    if (!alive()) return;
    try {
        if (level === null) {
            win!.setOverlayIcon(null, '');
            win!.setProgressBar(-1);
            win!.flashFrame(false);
        } else {
            win!.setOverlayIcon(dotFor(level), level === 'critical' ? 'Non sei in onda' : 'Problema sulla diretta');
            win!.setProgressBar(1, { mode: level === 'critical' ? 'error' : 'paused' });
        }
    } catch { /* barra delle applicazioni non disponibile */ }
};

const showToast = (title: string, body: string, sticky: boolean) => {
    try {
        if (!Notification.isSupported()) return;
        toast?.close();
        const n = new Notification({ title, body, silent: true, timeoutType: sticky ? 'never' : 'default' });
        n.on('click', () => {
            if (!alive()) return;
            if (win!.isMinimized()) win!.restore();
            win!.show();
            win!.focus();
        });
        n.show();
        toast = n;
    } catch { /* notifiche disattivate o non disponibili */ }
};

/** Va chiamata per ogni finestra creata. Tornare su StreamFlow spegne lampeggio e rosso. */
export const bindAlertWindow = (window: BrowserWindow) => {
    win = window;
    window.on('focus', () => {
        try { window.flashFrame(false); } catch { /* finestra in chiusura */ }
        // Il rosso dice «guarda StreamFlow»: guardato, ha fatto il suo lavoro.
        // L'ambra resta finché il problema è in corso.
        if (taskbar === 'critical') setTaskbar(null);
    });
};

/**
 * Alza un avviso. Con StreamFlow davanti non serve la notifica (il messaggio è
 * già a video), e un «non sei in onda» non lascia nemmeno il rosso sulla barra.
 */
export const raiseAlert = (level: AlertLevel, title: string, body: string) => {
    const front = inFront();
    if (level === 'critical' && front) {
        setTaskbar(null);
        return;
    }
    setTaskbar(level);
    if (front) return;
    try { win?.flashFrame(true); } catch { /* finestra in chiusura */ }
    showToast(title, body, level === 'critical');
};

/** Buona notizia (di nuovo in onda): via gli avvisi, e una notifica se StreamFlow non è davanti. */
export const resolveAlert = (title: string, body: string) => {
    setTaskbar(null);
    if (!inFront()) showToast(title, body, false);
};

/** Tutto regolare: via pallino, colore, lampeggio e l'eventuale notifica rimasta. */
export const clearAlert = () => {
    setTaskbar(null);
    try { toast?.close(); } catch { /* già chiusa */ }
    toast = null;
};
