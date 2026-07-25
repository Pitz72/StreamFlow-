/**
 * Traduce il nome dispositivo DirectShow (quello che usa FFmpeg, e che l'utente
 * vede nel menu a tendina) nell'ID opaco che si aspetta getUserMedia.
 *
 * Sono due mondi diversi: dshow espone i nomi hardware, Chrome espone hash che
 * cambiano a ogni profilo. L'unico ponte è il campo `label`, che però resta
 * vuoto finché non è stato concesso almeno un permesso microfono — da qui la
 * getUserMedia "di sblocco" prima di enumerateDevices.
 */
export const resolveInputDeviceId = async (dshowName: string): Promise<string | null> => {
    if (!dshowName || dshowName === 'default') return null;

    const unlock = await navigator.mediaDevices.getUserMedia({ audio: true });
    let devices: MediaDeviceInfo[];
    try {
        devices = await navigator.mediaDevices.enumerateDevices();
    } finally {
        unlock.getTracks().forEach((t) => t.stop());
    }

    const matched = devices.find(
        (d) =>
            d.kind === 'audioinput' &&
            (d.label.includes(dshowName) ||
                dshowName.includes(d.label.replace(/^(Default|Communications) - /, '').trim())),
    );
    return matched ? matched.deviceId : null;
};
