# LO SFARFALLIO DA FAST SYNC — perché StreamFlow ha uno strato che non si vede

> **8 agosto 2026**, StreamFlow v0.8.4. La diagnosi non è nata qui: è stata fatta
> e chiusa il **7 agosto 2026** sul progetto *Il Mistero della Santa Maria*
> (`devdocs/SFARFALLIO_FAST_SYNC.md` in quel repo), che è pure lui un'applicazione
> Electron. Qui è stato **riportato il rimedio**, non ridiagnosticato il difetto.

---

## In una riga

Con la sincronizzazione verticale NVIDIA su «Veloce» (Fast Sync), il monitor
mostra fotogrammi di schermate già abbandonate, alternati a quelli buoni.
L'applicazione disegna correttamente: il guasto è **interamente a valle del
renderer**. Non è un difetto di StreamFlow in particolare — ce l'ha qualunque
applicazione Electron con un'interfaccia ferma.

---

## Il meccanismo, per intero

Chromium ridisegna e ripresenta una superficie **solo quando qualcosa cambia**.
La schermata di StreamFlow è ferma quasi sempre: fuori dalle lancette del VU non
cambia niente per minuti interi, quindi la superficie principale non viene mai
ripresentata. Fast Sync rende senza freno e a ogni scansione serve al monitor
«l'ultima copia completa» che trova nella catena di buffer: se nessuno le
riscrive, quelle copie contengono ancora una schermata **abbandonata anche minuti
prima**. Il monitor alterna fotogrammi di età diversa — è, alla lettera, lo
sfarfallio.

Sul progetto d'origine la prova è stata misurata sui filmati fatti **col telefono
puntato sullo schermo** (una cattura di schermo legge il fotogramma che
l'applicazione consegna, che è pulito per definizione; una telecamera legge
quello che il **monitor emette**): nel tratto agitato la luminanza media aveva un
periodo esatto di cinque fotogrammi con 32 livelli su 255 di escursione, e sei
fotogrammi consecutivi mostravano **due pagine intere che si alternavano** —
pagine che il programma non può disegnare insieme, perché sono rami esclusivi
dello stesso stato.

### ⭐ Il dettaglio che ha chiuso la diagnosi

L'unica zona di schermo che **non** sfarfallava era un elemento **animato**. Un
elemento animato viene promosso a strato di composizione proprio, e quello strato
è ripresentato a ogni fotogramma — quindi arriva sempre fresco.

⛔ **Le animazioni non sporcano lo schermo: sono l'unica parte che resta pulita.**
L'ipotesi di partenza («le animazioni innescano lo sfarfallio») era giusta nella
correlazione e **rovesciata nel verso**.

### E in StreamFlow quell'elemento c'è già

È il VU. La lancetta è un `<rect>` SVG la cui `transform: rotate()` viene
riscritta a ogni fotogramma dal loop `requestAnimationFrame` di
`useAudioVisualizer` (`src/renderer/components/VuMeter.tsx`, `style.transform`).
`transform` è una proprietà del compositore: la lancetta vive sul suo strato,
arriva sempre fresca — e **proprio per questo non porta con sé niente del resto
della finestra**. Su una macchina con Fast Sync attiva ci si aspetta esattamente
quel quadro: due VU puliti su un'intestazione e un pannello che sfarfallano.

---

## Il rimedio — `PresentazioneContinua.tsx`

`src/renderer/components/PresentazioneContinua.tsx`, montato in `App.tsx`.

Uno strato a tutto schermo, trasparente, `pointer-events: none`, `aria-hidden`,
il cui **colore di fondo** cambia di quattro millesimi di alfa a ogni fotogramma.
Invisibile all'occhio, ma obbliga a ridisegnare e ripresentare la superficie
principale a ogni vsync, così tutte le copie della catena di buffer restano
fresche.

⛔ **Tre vincoli, e ognuno è il motivo per cui funziona.** Sono scritti per esteso
in testa al componente, e non sono dettagli di stile:

1. **Si anima il COLORE DI FONDO, non `transform` né `opacity`.** Quelle sono
   proprietà del compositore: lo strato si prenderebbe una superficie tutta sua e
   resterebbe l'unico rettangolo pulito su uno schermo sporco — cioè la lancetta
   del VU una seconda volta, e cioè esattamente il difetto che stiamo curando. Il
   colore di fondo è una proprietà di **disegno** e obbliga a ridisegnare la
   superficie sottostante.
2. **Va agganciato a `document.body` via portal**, non dentro l'albero
   dell'interfaccia. Un antenato con `transform`, `filter` o `perspective`
   diventa il contenitore dei discendenti `position: fixed`: agganciato lì
   dentro, lo strato coprirebbe quella sottoarea invece della finestra intera.
   ⚠️ In StreamFlow oggi un antenato così **non c'è** (`body > #root >
   div.deco-panel-bg`, nessuna regola su `#root`): montarlo dentro l'albero
   funzionerebbe **per combinazione**. Ma il `Modal` usa già `backdrop-blur-sm` e
   il toast un `-translate-x-1/2`: il primo antenato che romperebbe tutto è a una
   modifica di distanza, e si romperebbe **in silenzio**.
3. **Il ritmo è `requestAnimationFrame`, non `setInterval`.** Serve un
   aggiornamento per ogni fotogramma **effettivamente presentato**, e solo rAF è
   allineato a quella cadenza.

**Quarto vincolo, implicito:** i due valori di alfa devono essere **diversi**
(`0.004` e `0`). Due valori identici non contano come cambiamento e il ridisegno
salta.

---

## 🪤 La trappola dell'esperimento riuscito

Tolto lo strato, il difetto **non torna subito** — e sembra smentire tutto. Non è
così: lo strato aveva già riempito **tutte** le copie con la stessa immagine, e
l'alternanza continua fra copie identiche, quindi invisibile. La conferma arriva
solo al **cambio di contenuto successivo**: si apre la Configurazione, o lo stato
passa a ON AIR, e riaffiora la schermata di prima.

⛔ **Da qui: il rimedio è permanente e non ha interruttore.** Un interruttore
acceso «quando serve» arriverebbe sempre tardi di una schermata, e farebbe dire
«adesso è a posto» a chi sta guardando un fotogramma morto.

---

## Come si riproduce e come si collauda

Il difetto **non si vede** senza Fast Sync attiva. Per collaudare va acceso
apposta:

- NVIDIA App → **Grafica** → **Impostazioni globali** → in fondo,
  *Sincronizzazione verticale* → **Veloce**.
- Nell'app NVIDIA il valore in **grassetto** è quello modificato rispetto al
  valore di fabbrica: è il modo più rapido per vedere com'è messo. Non esiste un
  pulsante «applica», si salva da sola.
- ⛔ **La V-Sync si rilegge all'avvio del processo**: dopo il cambio va chiusa
  davvero l'applicazione (anche dal tray), non solo la finestra.
- ⛔ **Finito il collaudo, rimettere «Usa l'impostazione dell'applicazione 3D»**,
  che è il valore di fabbrica. Lasciarlo su «Veloce» sporca **tutte** le altre
  applicazioni Electron della macchina.
- Il difetto **non** dipende da schermo intero contro finestra: verificato con
  F11 sul progetto d'origine, identico.

---

## Il costo, misurato

⚠️ Il ridisegno continuo tiene la GPU sveglia in permanenza, **anche su chi non
ha nessun problema**. Misurato sulle build impacchettate 0.8.3 (senza strato) e
0.8.4 (con strato), a riposo, tema scuro, finestra in primo piano, tre repliche
per versione — i numeri completi e il metodo sono in [log/0.8.4.md](./log/0.8.4.md):

| | 0.8.3 (senza) | 0.8.4 (con) |
|---|---:|---:|
| GPU, media | **0,65 %** | **2,51 %** |
| CPU, % di un core | 14,8 % | 19,5 % |
| CPU, % della macchina (16 core logici) | 0,92 % | 1,22 % |
| RAM (working set, 6 processi) | 551 MB | 556 MB |

La GPU quadruplica, ma da un valore trascurabile a un valore piccolo: resta sotto
il 3%. Sulla CPU la dispersione fra repliche della **stessa** versione (13,2–17,0
punti sulla 0.8.3) è dello stesso ordine della differenza fra le versioni: c'è un
aumento, ma quel dato **non è misurato con precisione sufficiente** per dargli una
cifra secca. Va ricordato che il loop rAF del VU gira già in entrambe.

Su un fisso non si nota. Su un portatile a batteria è una scelta consapevole.

---

## ⏳ Cosa resta aperto

- **La verifica visiva con Fast Sync accesa.** Il rimedio è quello già collaudato
  altrove, ma su StreamFlow non è ancora stato *visto* funzionare: serve una
  macchina con V-Sync «Veloce» e la build 0.8.4 impacchettata.
- **Il video: qui non c'è.** StreamFlow non riproduce nessun video — non esiste un
  solo `<video>` nel progetto, e l'unica traccia video è quella che
  `getDisplayMedia` pretende in MIX MODE, rimossa e fermata subito
  (`useMixEngine.ts`). Il sospetto di regressione lasciato aperto sul progetto
  d'origine (un ridisegno continuo può togliere un `<video>` dalla corsia
  hardware) **non ha bersaglio** in StreamFlow. Se un domani comparirà un video
  vero — pre-ascolto, jingle con clip, anteprime — questa voce va riaperta e
  misurata prima di dare per buono niente.
- **La catena di presentazione del video è comunque separata:** questo strato non
  la cura. Un eventuale difetto sul primo fotogramma di una clip sarebbe un
  guasto **gemello**, non lo stesso, e andrebbe curato a parte.
