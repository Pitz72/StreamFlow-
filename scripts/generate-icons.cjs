/*
 * Genera l'intero set di icone dell'app dal marchio in branding/ (proposta «Onda», 30/10/2026):
 *   - build/icons/<size>x<size>.png   (set Linux, richiesto da electron-builder)
 *   - build/icon.png                  (1024, sorgente/fallback)
 *   - public/icon.ico                 (Windows, multi-risoluzione)
 *   - build/icon.icns                 (macOS, contenitore PNG assemblato in Node)
 *
 * 16, 24 e 32 px vengono da branding/streamflow-icon-small.svg (tratto più spesso, punto
 * rosso più grande, senza alone); le altre misure da branding/streamflow-icon.svg.
 * Rasterizza con il motore di Chromium di Electron: il renderer SVG di ImageMagick
 * sbaglia aloni e sfumature. ICO e ICNS sono assemblati in Node puro.
 *
 * Uso: npm run icons   (= electron scripts/generate-icons.cjs)
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAND = path.join(ROOT, 'branding');
const ICONS_DIR = path.join(ROOT, 'build', 'icons');
const PUBLIC_DIR = path.join(ROOT, 'public');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const SMALL = new Set([16, 24, 32]);
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function rasterize(win, svgFile, sizes) {
  const svg = fs.readFileSync(svgFile, 'utf8');
  const urls = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(${JSON.stringify(svg)})));
    await img.decode();
    const res = {};
    for (const s of ${JSON.stringify(sizes)}) {
      // disegno a 4x e riduco a metà per passi: bordi puliti anche a 16 px
      let cur = document.createElement('canvas');
      cur.width = cur.height = s * 4;
      cur.getContext('2d').drawImage(img, 0, 0, cur.width, cur.height);
      while (cur.width > s) {
        const n = document.createElement('canvas');
        n.width = n.height = Math.max(s, Math.round(cur.width / 2));
        const ctx = n.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(cur, 0, 0, n.width, n.height);
        cur = n;
      }
      res[s] = cur.toDataURL('image/png');
    }
    return res;
  })()`);
  const out = {};
  for (const [s, url] of Object.entries(urls)) out[s] = Buffer.from(url.split(',')[1], 'base64');
  return out;
}

// ICO con voci PNG (Windows Vista e successivi)
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = [];
  let offset = 6 + 16 * pngs.length;
  for (const [size, png] of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...pngs.map(([, png]) => png)]);
}

// ICNS: tipi PNG moderni letti da macOS
const ICNS_TYPES = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };
function buildIcns(bySize) {
  const entries = Object.entries(ICNS_TYPES).map(([size, osType]) => {
    const png = bySize[size];
    const h = Buffer.alloc(8);
    h.write(osType, 0, 4, 'ascii');
    h.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([h, png]);
  });
  const body = Buffer.concat(entries);
  const h = Buffer.alloc(8);
  h.write('icns', 0, 4, 'ascii');
  h.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([h, body]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    const win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html,<html><body></body></html>');
    const bySize = {
      ...(await rasterize(win, path.join(BRAND, 'streamflow-icon.svg'), SIZES.filter((s) => !SMALL.has(s)))),
      ...(await rasterize(win, path.join(BRAND, 'streamflow-icon-small.svg'), SIZES.filter((s) => SMALL.has(s)))),
    };
    console.log('Icone dal marchio in branding/:');
    for (const s of SIZES) {
      fs.writeFileSync(path.join(ICONS_DIR, `${s}x${s}.png`), bySize[s]);
      console.log(`  build/icons/${s}x${s}.png`);
    }
    fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), bySize[1024]);
    console.log('  build/icon.png');
    fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.ico'), buildIco(ICO_SIZES.map((s) => [s, bySize[s]])));
    console.log('  public/icon.ico');
    fs.writeFileSync(path.join(ROOT, 'build', 'icon.icns'), buildIcns(bySize));
    console.log('  build/icon.icns');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  app.quit();
});
