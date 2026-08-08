import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ============================================================================
   PRESENTAZIONE CONTINUA — il rimedio allo sfarfallio da Fast Sync
   ============================================================================

   ⛔ NON È UN EFFETTO. Non si vede, non decora, e toglierlo «perché non fa
   niente» rimette in gioco un difetto che rende illeggibile l'interfaccia su
   una fascia intera di macchine. Se un giorno sembra codice morto, si legga
   prima questo commento e `docs/SFARFALLIO_FAST_SYNC.md`.

   ── IL DIFETTO ──
   Diagnosticato il 7 agosto 2026 su un altro progetto (Il Mistero della Santa
   Maria, RTX 2070), e portato qui perché non è un difetto di quel programma:
   ce l'ha qualunque applicazione Electron. Si manifesta con la sincronizzazione
   verticale NVIDIA su «Veloce» (Fast Sync) nelle Impostazioni globali. Sintomo:
   l'interfaccia sfarfalla in modo insopportabile, alternando la schermata
   corrente con una **abbandonata anche minuti prima**. Il desktop non ne soffre,
   e nemmeno le zone animate.

   ── PERCHÉ SUCCEDE ──
   Chromium ridisegna e ripresenta una superficie solo quando qualcosa cambia.
   La schermata di StreamFlow è quasi sempre ferma — fuori dalle lancette non
   cambia niente per minuti interi — quindi la superficie principale non viene
   mai ripresentata. Fast Sync rende senza freno e a ogni scansione serve al
   monitor «l'ultima copia completa» che trova nella catena di buffer: se
   nessuno le riscrive, quelle copie contengono ancora la schermata precedente.
   Il monitor mostra fotogrammi di età diversa in rapida successione: è, alla
   lettera, lo sfarfallio.

   ⭐ Il dettaglio che ha chiuso la diagnosi: l'unica zona che NON sfarfallava
   era un elemento animato. Un elemento animato viene promosso a strato di
   composizione proprio, e quello strato viene ripresentato a ogni fotogramma —
   quindi arriva sempre fresco. Le animazioni non sporcano lo schermo: sono
   l'unica parte che resta pulita.

   Qui quell'elemento ce l'abbiamo già, ed è il VU: la lancetta è un `transform:
   rotate()` scritto a ogni fotogramma dal loop rAF (`VuMeter.tsx` +
   `useAudioVisualizer`). Vive sul suo strato, arriva sempre fresca — e proprio
   per questo non porta con sé niente del resto della finestra.

   ── IL RIMEDIO ──
   Se il difetto è che la superficie principale non viene mai ripresentata, la
   si fa ripresentare. Uno strato a tutto schermo, trasparente, il cui colore di
   fondo cambia di quattro millesimi di alfa a ogni fotogramma: invisibile
   all'occhio, ma sufficiente a tenere fresche tutte le copie.

   ⛔ TRE VINCOLI, E OGNUNO È IL MOTIVO PER CUI FUNZIONA:

   1. **Si anima il COLORE DI FONDO, non `transform` né `opacity`.** Quelle due
      sono proprietà del compositore: l'elemento si prenderebbe uno strato
      tutto suo e resterebbe l'unico rettangolo pulito su uno schermo sporco —
      cioè la lancetta del VU, un'altra volta, e cioè esattamente il difetto.
      Il colore di fondo è una proprietà di disegno, e obbliga a ridisegnare la
      superficie sottostante.
   2. **Sta su `document.body` via portal, non dentro l'albero dell'interfaccia.**
      Un antenato con `transform`, `filter` o `perspective` diventa il
      contenitore dei discendenti `position: fixed`: agganciato lì dentro, lo
      strato coprirebbe quella sottoarea invece della finestra intera. Oggi in
      StreamFlow un antenato così non c'è, quindi montarlo dentro `App`
      funzionerebbe — per combinazione. Ma il `Modal` usa già `backdrop-blur`
      e il toast un `-translate-x-1/2`: il primo antenato che rompe tutto è a
      una modifica di distanza, e si romperebbe in silenzio. Il portal toglie
      la questione di mezzo per sempre.
   3. **Il ritmo è `requestAnimationFrame`, non un timer.** Serve un
      aggiornamento per ogni fotogramma effettivamente presentato, e solo rAF è
      allineato a quella cadenza. Un `setInterval` a 16 ms scivola rispetto al
      refresh e salta o raddoppia fotogrammi proprio dove non deve.

   ── ⚠️ LA TRAPPOLA DELL'ESPERIMENTO RIUSCITO ──
   Chi toglie questo strato per provare che «non serve» vedrà che il difetto
   NON torna subito, e concluderà che era codice morto. È il contrario: lo
   strato aveva già riempito tutte le copie con la stessa immagine, e
   l'alternanza continua fra copie identiche — quindi invisibile. Il difetto
   ricompare al **primo cambio di contenuto successivo**: si apre la
   Configurazione, o cambia lo stato in ON AIR, e riaffiora la schermata di
   prima.

   ⛔ Da qui la regola: il rimedio è permanente e non ha interruttore. Un
   interruttore acceso «quando serve» arriverebbe sempre tardi di una schermata,
   e farebbe dire «adesso è a posto» a chi sta guardando un fotogramma morto.

   ── COSA NON RISOLVE ──
   La catena di presentazione del percorso video (overlay hardware) è separata e
   questo strato non la tocca. Oggi non ci riguarda: StreamFlow non riproduce
   nessun video — l'unica traccia video del progetto è quella che
   `getDisplayMedia` pretende in MIX MODE, rimossa e fermata subito
   (`useMixEngine.ts`). Se un domani comparirà un `<video>` vero e avrà un
   difetto sul primo fotogramma, è un guasto gemello, non questo, e va curato a
   parte.

   ── COSTO ──
   Tiene la GPU sveglia in permanenza, anche su chi non ha nessun problema.
   Misurato sulla build 0.8.4 impacchettata, a riposo, tema scuro: vedi
   `docs/log/0.8.4.md` per i numeri. Su un fisso non si nota; su un portatile a
   batteria è una scelta consapevole.
   ========================================================================== */

export default function PresentazioneContinua() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        let vivo = true;
        let pari = false;

        const tick = () => {
            if (!vivo) return;
            pari = !pari;
            /* Quattro millesimi di nero: sotto la soglia di visibilità su
               qualunque fondo (e su entrambi i temi, chiaro compreso), sopra la
               soglia di «niente è cambiato» per il motore di disegno. Zero e
               zero non basterebbero: due valori identici non contano come
               cambiamento e il ridisegno salta. */
            el.style.backgroundColor = pari ? 'rgba(0,0,0,0.004)' : 'rgba(0,0,0,0)';
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        return () => { vivo = false; };
    }, []);

    return createPortal(
        <div
            ref={ref}
            aria-hidden="true"
            style={{
                position: 'fixed',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 2147483647,
            }}
        />,
        document.body,
    );
}
