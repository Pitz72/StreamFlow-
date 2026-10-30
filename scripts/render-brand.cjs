/*
 * Rasterizza i vettoriali del marchio (branding/*.svg) in branding/png/ con il motore di
 * Chromium di Electron: sfumature, aloni e angoli dello squircle escono come nel browser
 * (il renderer SVG di ImageMagick sbaglia filtri e maschere).
 *
 * Uso: npx electron scripts/render-brand.cjs
 * Prima rigenerare i vettoriali con: python branding/sorgenti/build_brand.py
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const BRAND = path.resolve(__dirname, '..', 'branding');
const OUT = path.join(BRAND, 'png');
const JOBS = [
  ['streamflow-icon.svg', [1024, 512, 256, 64]],
  ['streamflow-icon-small.svg', [32, 16]],
  ['streamflow-mark.svg', [1024]],
  ['streamflow-logotype.svg', [1600]],
  ['streamflow-lockup.svg', [1600]],
  ['banner-streamflow-v1.svg', [1920]],
];

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  for (const [file, widths] of JOBS) {
    const svg = fs.readFileSync(path.join(BRAND, file), 'utf8');
    const urls = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(${JSON.stringify(svg)})));
      await img.decode();
      const res = {};
      for (const w of ${JSON.stringify(widths)}) {
        const h = Math.round(w * img.naturalHeight / img.naturalWidth);
        // disegno grande e riduco a metà per passi: bordi puliti anche a 16 px
        const k = w <= 1024 ? 4 : 2;
        let cur = document.createElement('canvas');
        cur.width = w * k; cur.height = h * k;
        cur.getContext('2d').drawImage(img, 0, 0, cur.width, cur.height);
        while (cur.width > w) {
          const n = document.createElement('canvas');
          n.width = Math.max(w, Math.round(cur.width / 2));
          n.height = Math.max(h, Math.round(cur.height / 2));
          const ctx = n.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(cur, 0, 0, n.width, n.height);
          cur = n;
        }
        res[w] = cur.toDataURL('image/png');
      }
      return res;
    })()`);
    const base = file.replace(/\.svg$/, '');
    for (const [w, url] of Object.entries(urls)) {
      const name = widths.length > 1 ? `${base}-${w}.png` : `${base}.png`;
      fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
      console.log('  branding/png/' + name);
    }
  }
  app.quit();
});
