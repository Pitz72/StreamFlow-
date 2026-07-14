#!/usr/bin/env node
/*
 * Genera l'intero set di icone dell'app da build/icon.svg:
 *   - build/icons/<size>x<size>.png   (set Linux, richiesto da electron-builder)
 *   - build/icon.png                  (1024, sorgente/fallback)
 *   - public/icon.ico                 (Windows, multi-risoluzione)
 *   - build/icon.icns                 (macOS, contenitore PNG assemblato in Node)
 *
 * Richiede ImageMagick (`magick`) per rasterizzare SVG e comporre l'ICO.
 * L'ICNS è assemblato in Node puro (nessun tool macOS necessario).
 *
 * Uso: node scripts/generate-icons.cjs
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'build', 'icon.svg');
const ICONS_DIR = path.join(ROOT, 'build', 'icons');
const PUBLIC_DIR = path.join(ROOT, 'public');

const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

function magick(args) {
  execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

// 1) Rasterizza il set PNG (Linux) + build/icon.png
ensureDir(ICONS_DIR);
ensureDir(PUBLIC_DIR);
console.log('Rasterizzo PNG da', path.relative(ROOT, SRC));
for (const s of SIZES) {
  const out = path.join(ICONS_DIR, `${s}x${s}.png`);
  magick([
    '-background', 'none',
    '-density', '384',
    SRC,
    '-resize', `${s}x${s}`,
    out,
  ]);
  console.log('  build/icons/' + `${s}x${s}.png`);
}
fs.copyFileSync(path.join(ICONS_DIR, '1024x1024.png'), path.join(ROOT, 'build', 'icon.png'));
console.log('  build/icon.png');

// 2) Windows .ico (multi-risoluzione)
const icoSizes = [16, 32, 48, 64, 128, 256].map((s) => path.join(ICONS_DIR, `${s}x${s}.png`));
magick([...icoSizes, path.join(PUBLIC_DIR, 'icon.ico')]);
console.log('  public/icon.ico');

// 3) macOS .icns — contenitore ICNS con PNG embeddati.
//    Mappatura dimensione → OSType (tipi PNG moderni, letti da macOS).
const ICNS_TYPES = {
  16: 'icp4',
  32: 'icp5',
  64: 'icp6',
  128: 'ic07',
  256: 'ic08',
  512: 'ic09',
  1024: 'ic10',
};
const entries = [];
for (const [size, osType] of Object.entries(ICNS_TYPES)) {
  const png = fs.readFileSync(path.join(ICONS_DIR, `${size}x${size}.png`));
  const header = Buffer.alloc(8);
  header.write(osType, 0, 4, 'ascii');
  header.writeUInt32BE(png.length + 8, 4);
  entries.push(Buffer.concat([header, png]));
}
const body = Buffer.concat(entries);
const fileHeader = Buffer.alloc(8);
fileHeader.write('icns', 0, 4, 'ascii');
fileHeader.writeUInt32BE(body.length + 8, 4);
fs.writeFileSync(path.join(ROOT, 'build', 'icon.icns'), Buffer.concat([fileHeader, body]));
console.log('  build/icon.icns');

console.log('Icone generate.');
