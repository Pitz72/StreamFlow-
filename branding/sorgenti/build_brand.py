"""Genera il marchio di Runtime StreamFlow (proposta 2 «Onda», scelta il 30/10/2026).

    python branding/sorgenti/build_brand.py

Scrive in branding/ i vettoriali: simbolo con e senza fondo, logotipo, logotipo affiancato
al simbolo e banner. Tutte le scritte sono convertite in tracciati (Sora per il nome e lo
slogan, JetBrains Mono per le etichette), quindi i file non dipendono da font installati.
Le PNG si ricavano con scripts/render-brand.cjs (motore di Chromium).
"""
import io
import math
import os

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.dirname(HERE)
ROOT = os.path.dirname(BRAND)

INK = '#F4F8F6'
INK_SOFT = '#C9D6D2'
INK_DIM = '#7E938D'
GREEN = '#3FD69B'
MINT = '#C8F8E2'
DEEP = '#11785B'
RED = '#EF4A3C'
NIGHT = '#040B0A'


# ── Testo in tracciati ────────────────────────────────────────────────────────

class Face:
    def __init__(self, path, **variations):
        tt = TTFont(path)
        tt.flavor = None
        buf = io.BytesIO()
        tt.save(buf)
        self.face = hb.Face(hb.Blob(buf.getvalue()))
        self.upem = self.face.upem
        self.font = hb.Font(self.face)
        if variations:
            self.font.set_variations(variations)


SORA = Face(os.path.join(HERE, 'font', 'Sora-SemiBold.ttf'))
SORA_REG = Face(os.path.join(HERE, 'font', 'Sora-Regular.ttf'))
MONO = Face(os.path.join(ROOT, 'node_modules', '@fontsource-variable', 'jetbrains-mono', 'files',
                         'jetbrains-mono-latin-wght-normal.woff2'), wght=500)


class Bounds:
    def __init__(self):
        self.box = None

    def add(self, b):
        if b is None:
            return
        if self.box is None:
            self.box = list(b)
        else:
            self.box = [min(self.box[0], b[0]), min(self.box[1], b[1]),
                        max(self.box[2], b[2]), max(self.box[3], b[3])]


def text(face, s, size, x, base, track_em=0.0, bounds=None):
    """Tracciato SVG del testo `s` con la linea di base a y=`base`. Ritorna (d, avanzamento)."""
    buf = hb.Buffer()
    buf.add_str(s)
    buf.guess_segment_properties()
    hb.shape(face.font, buf, {'kern': True, 'liga': True})
    k = size / face.upem
    track = track_em * face.upem
    pen = SVGPathPen(None)
    cur = 0.0
    n = len(buf.glyph_infos)
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        dx = x + (cur + pos.x_offset) * k
        face.font.draw_glyph_with_pen(info.codepoint, TransformPen(pen, (k, 0, 0, -k, dx, base)))
        if bounds is not None:
            bp = BoundsPen(None)
            face.font.draw_glyph_with_pen(info.codepoint, TransformPen(bp, (k, 0, 0, -k, dx, base)))
            bounds.add(bp.bounds)
        cur += pos.x_advance + (track if i < n - 1 else 0)
    return pen.getCommands(), cur * k


# ── Simbolo «Onda» ────────────────────────────────────────────────────────────

# La S è un'onda: ansa alta, dorso dritto in diagonale, ansa bassa. Tangenti continue
# in ogni giunzione, estremità tonde. Il punto rosso è il segnale che parte.
S_PATH = ('M676 300 C620 228 470 214 396 262 C318 312 330 416 430 456 L590 520 '
          'C700 564 716 690 640 752 C566 812 412 808 344 730')
S_PLACE = 'translate(512 506) scale(.9) translate(-510 -515)'


def symbol(uid, squircle=True, small=False):
    """Contenuto SVG del simbolo in un riquadro 1024×1024 (id univoci con il prefisso uid).
    small=True è il disegno per 16-32 px: tratto più spesso, punto più grande, niente alone."""
    stroke, dot, dot_r = (150, (800, 222), 62) if small else (132, (790, 226), 40)
    g = f'{uid}-wave'
    f = f'{uid}-glow'
    out = [f'<defs>'
           f'<linearGradient id="{g}" gradientUnits="userSpaceOnUse" x1="700" y1="220" x2="330" y2="800">'
           f'<stop offset="0" stop-color="{MINT}"/><stop offset=".45" stop-color="{GREEN}"/>'
           f'<stop offset="1" stop-color="{DEEP}"/></linearGradient>'
           f'<filter id="{f}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>']
    if squircle:
        out.append(f'<linearGradient id="{uid}-bg" x1="0" y1="0" x2="0" y2="1">'
                   f'<stop offset="0" stop-color="#10261F"/><stop offset="1" stop-color="#050C0A"/></linearGradient>')
    out.append('</defs>')
    if squircle:
        out.append(f'<rect x="40" y="40" width="944" height="944" rx="220" fill="url(#{uid}-bg)"/>')
        out.append('<rect x="41.5" y="41.5" width="941" height="941" rx="218.5" fill="none" '
                   'stroke="#FFFFFF" stroke-opacity=".08" stroke-width="3"/>')
    out.append(f'<g transform="{S_PLACE}">')
    if not small:
        out.append(f'<path d="{S_PATH}" fill="none" stroke="url(#{g})" stroke-width="{stroke}" '
                   f'stroke-linecap="round" opacity=".55" filter="url(#{f})"/>'
                   f'<circle cx="{dot[0]}" cy="{dot[1]}" r="{dot_r + 4}" fill="{RED}" opacity=".6" filter="url(#{f})"/>')
    out.append(f'<path d="{S_PATH}" fill="none" stroke="url(#{g})" stroke-width="{stroke}" stroke-linecap="round"/>'
               f'<circle cx="{dot[0]}" cy="{dot[1]}" r="{dot_r}" fill="{RED}"/></g>')
    return '\n'.join(out)


# ── Logotipo ──────────────────────────────────────────────────────────────────

def logotype(uid, size, x, base):
    """«Stream» chiaro + «Flow» nella sfumatura dell'onda. Ritorna (svg, larghezza, bounds)."""
    b = Bounds()
    d1, w1 = text(SORA, 'Stream', size, x, base, -0.03, b)
    gap = -0.03 * size
    d2, w2 = text(SORA, 'Flow', size, x + w1 + gap, base, -0.03, b)
    x2, x3 = x + w1 + gap, x + w1 + gap + w2
    svg = (f'<defs><linearGradient id="{uid}-flow" gradientUnits="userSpaceOnUse" '
           f'x1="{x2:.1f}" y1="0" x2="{x3:.1f}" y2="0">'
           f'<stop offset="0" stop-color="#7DE8BC"/><stop offset=".55" stop-color="{GREEN}"/>'
           f'<stop offset="1" stop-color="#1E9E72"/></linearGradient></defs>'
           f'<path d="{d1}" fill="{INK}"/><path d="{d2}" fill="url(#{uid}-flow)"/>')
    return svg, x3 - x, b.box


def svg_doc(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{rect}{body}</svg>\n')


def write(name, content):
    with open(os.path.join(BRAND, name), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(content)
    print('  branding/' + name)


# ── Banner ────────────────────────────────────────────────────────────────────

def waves(x0, x1, specs):
    out = []
    for y0, amp, period, phase, opacity, width in specs:
        pts = []
        x = x0
        while x <= x1:
            # l'ampiezza cresce verso destra: l'onda «esce» dal simbolo
            a = amp * (0.25 + 0.75 * (x - x0) / (x1 - x0))
            pts.append(f'{x:.0f} {y0 + a * math.sin((x / period) * 2 * math.pi + phase):.1f}')
            x += 6
        out.append(f'<path d="M{" L".join(pts)}" fill="none" stroke="{GREEN}" '
                   f'stroke-opacity="{opacity}" stroke-width="{width}"/>')
    return '\n'.join(out)


def banner():
    W, H = 1920, 823
    icon_size, icon_x = 460, 170
    icon_y = (H - icon_size) / 2
    tx = 780
    parts = ['<defs>'
             '<radialGradient id="bn-halo" cx="400" cy="412" r="560" gradientUnits="userSpaceOnUse">'
             '<stop offset="0" stop-color="#1E9E72" stop-opacity=".30"/>'
             '<stop offset=".55" stop-color="#1E9E72" stop-opacity=".07"/>'
             '<stop offset="1" stop-color="#1E9E72" stop-opacity="0"/></radialGradient>'
             '<radialGradient id="bn-sky" cx="1650" cy="60" r="760" gradientUnits="userSpaceOnUse">'
             '<stop offset="0" stop-color="#3EC6E0" stop-opacity=".07"/>'
             '<stop offset="1" stop-color="#3EC6E0" stop-opacity="0"/></radialGradient>'
             '<linearGradient id="bn-top" x1="0" y1="0" x2="1" y2="0">'
             f'<stop offset="0" stop-color="{DEEP}"/><stop offset=".55" stop-color="{GREEN}"/>'
             f'<stop offset=".86" stop-color="{MINT}"/><stop offset="1" stop-color="{RED}"/></linearGradient>'
             '</defs>',
             f'<rect width="{W}" height="{H}" fill="{NIGHT}"/>',
             f'<rect width="{W}" height="{H}" fill="url(#bn-sky)"/>',
             f'<rect width="{W}" height="{H}" fill="url(#bn-halo)"/>',
             waves(640, W, [(690, 34, 520, 0.0, .10, 2), (712, 52, 610, 1.3, .07, 2),
                            (734, 24, 430, 2.4, .05, 2), (668, 18, 360, 3.6, .05, 1.5)]),
             f'<rect width="{W}" height="4" fill="url(#bn-top)"/>',
             f'<svg x="{icon_x}" y="{icon_y:.1f}" width="{icon_size}" height="{icon_size}" viewBox="0 0 1024 1024">'
             f'{symbol("bn")}</svg>',
             f'<rect x="{tx - 62}" y="250" width="2" height="323" fill="#1C332E"/>']
    d, _ = text(MONO, 'RUNTIME', 28, tx + 4, 250, 0.5)
    parts.append(f'<path d="{d}" fill="{INK_DIM}"/>')
    lt, lw, _ = logotype('bn', 168, tx, 418)
    parts.append(lt)
    # pillola
    pill_label = 'LIVE BROADCAST CLIENT'
    d, pw = text(MONO, pill_label, 21, 0, 0, 0.2)
    py, ph = 466, 50
    pill_w = 28 + 14 + 16 + pw + 26
    d, _ = text(MONO, pill_label, 21, tx + 28 + 14 + 16, py + 33, 0.2)
    parts.append(f'<rect x="{tx}" y="{py}" width="{pill_w:.1f}" height="{ph}" rx="{ph / 2}" '
                 f'fill="#0A1513" stroke="#24403A" stroke-width="2"/>'
                 f'<circle cx="{tx + 28 + 7}" cy="{py + ph / 2}" r="7" fill="{RED}"/>'
                 f'<path d="{d}" fill="{INK_SOFT}"/>')
    # slogan: One Mic. On Air.
    d1, w1 = text(SORA_REG, 'One Mic.', 60, tx, 606, -0.01)
    d2, _ = text(SORA, 'On Air.', 60, tx + w1 + 18, 606, -0.01)
    parts.append(f'<path d="{d1}" fill="{INK_SOFT}"/><path d="{d2}" fill="{GREEN}"/>')
    # piattaforma
    d, ww = text(MONO, 'WINDOWS', 22, 0, 0, 0.4)
    d, _ = text(MONO, 'WINDOWS', 22, W - 130 - ww, H - 70, 0.4)
    parts.append(f'<path d="{d}" fill="{INK_DIM}"/>')
    return svg_doc(W, H, '\n'.join(parts))


def main():
    print('Marchio StreamFlow:')
    write('streamflow-icon.svg', svg_doc(1024, 1024, symbol('ic')))
    write('streamflow-icon-small.svg', svg_doc(1024, 1024, symbol('sm', small=True)))
    write('streamflow-mark.svg', svg_doc(1024, 1024, symbol('mk', squircle=False)))

    # logotipo da solo, su fondo trasparente, con margine pari a mezza altezza della x
    size = 200
    lt, lw, box = logotype('lt', size, 0, 0)
    pad = 0.25 * size
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
    write('streamflow-logotype.svg',
          f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" '
          f'viewBox="{x0 - pad:.1f} {y0 - pad:.1f} {w:.1f} {h:.1f}">{lt}</svg>\n')

    # simbolo + logotipo affiancati (uso in testate e documenti)
    ih = 240
    lt, lw, box = logotype('lk', 132, ih + 56, 0)
    cap_mid = (box[1] + box[3]) / 2
    base = ih / 2 - cap_mid
    lt, lw, box = logotype('lk', 132, ih + 56, base)
    W = ih + 56 + lw + 24
    write('streamflow-lockup.svg',
          svg_doc(round(W), ih, f'<svg width="{ih}" height="{ih}" viewBox="0 0 1024 1024">{symbol("lk")}</svg>{lt}'))

    write('banner-streamflow-v1.svg', banner())


if __name__ == '__main__':
    main()
