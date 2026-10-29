/**
 * Traduce il nome dispositivo DirectShow (quello che usa FFmpeg, e che l'utente
 * vede nel menu a tendina) nell'ID opaco che si aspetta getUserMedia.
 *
 * Sono due mondi diversi: dshow espone i nomi hardware, Chrome espone hash che
 * cambiano a ogni profilo. L'unico ponte è il campo `label`, che però resta
 * vuoto finché non è stato concesso almeno un permesso microfono — da qui la
 * getUserMedia "di sblocco" prima di enumerateDevices.
 *
 * @returns null se non c'è corrispondenza: il chiamante userà il microfono
 *          predefinito e deve dirlo (in MIX MODE è la voce che va in onda).
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

    const matches = (d: MediaDeviceInfo) => {
        // Etichetta vuota (permesso negato): "".includes era vero per qualunque
        // nome e faceva scegliere il primo dispositivo della lista.
        const label = d.label.replace(/^(Default|Communications) - /, '').trim();
        if (!label) return false;
        return d.label.includes(dshowName) || dshowName.includes(label);
    };
    const inputs = devices.filter((d) => d.kind === 'audioinput' && matches(d));
    // Prima il dispositivo vero, poi le voci "Default -"/"Communications -":
    // quelle seguono il predefinito di Windows e cambierebbero microfono da
    // sole se il predefinito cambia durante la diretta.
    const matched = inputs.find((d) => d.deviceId !== 'default' && d.deviceId !== 'communications') ?? inputs[0];
    return matched ? matched.deviceId : null;
};
