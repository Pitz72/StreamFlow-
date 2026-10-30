# Il marchio di Runtime StreamFlow

Scelto da Simone il 30 ottobre 2026 fra sei proposte (`proposte/proposte-marchio.html`):
è la **proposta 2, «Onda»**. La S è un'onda sonora sfumata dal verde chiaro al verde
profondo, con un leggero alone; il punto rosso è il segnale che parte, la diretta.
Non segue lo schema lettera più orbita di Titan e FeedDownloader, per scelta.

Slogan: **One Mic. On Air.** Basta un microfono per andare in onda.

## I file

| File | Uso |
|------|-----|
| `streamflow-icon.svg` | Simbolo nello squircle scuro: icona dell'applicazione, dai 64 px in su |
| `streamflow-icon-small.svg` | Lo stesso disegno per 16 e 32 px: tratto più spesso, punto più grande, senza alone |
| `streamflow-mark.svg` | Simbolo senza fondo, per copertine e documenti su fondo scuro |
| `streamflow-logotype.svg` | Logotipo: «Stream» chiaro e «Flow» sfumato, in Sora SemiBold |
| `streamflow-lockup.svg` | Simbolo e logotipo affiancati, per testate |
| `banner-streamflow-v1.svg` | Banner 1920×823: simbolo, nome, pillola, slogan, piattaforma |
| `png/` | Le stesse immagini rasterizzate |

Tutte le scritte sono in tracciati: i file non dipendono da font installati.
Il banner non porta il numero di versione; il suffisso `-v1` serve al sito per
aggiornare la cache quando il banner cambia.

## Come si rigenerano

```bash
python branding/sorgenti/build_brand.py
npx electron scripts/render-brand.cjs
```

Il primo scrive i vettoriali (richiede `fonttools` e `uharfbuzz`), il secondo le PNG con il
motore di Chromium, perché il renderer SVG di ImageMagick sbaglia aloni e sfumature.
I font Sora sono in `sorgenti/font/` con la licenza OFL; JetBrains Mono arriva da `node_modules`.

## Colori

Fondo `#040B0A`, squircle da `#10261F` a `#050C0A`, onda da `#C8F8E2` a `#3FD69B` a `#11785B`,
diretta `#EF4A3C`, testo `#F4F8F6`. Sono i colori dell'interfaccia «Essenziale» dell'app.
