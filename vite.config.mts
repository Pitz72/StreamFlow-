import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

// index.html contiene la CSP di PRODUZIONE (script-src 'self', niente unsafe-*).
// Il dev server Vite inietta script inline (react-refresh preamble) e usa eval
// per i sourcemap: solo in `serve` rilassiamo la direttiva script-src.
const devCsp: Plugin = {
  name: 'streamflow-dev-csp',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace(
      "script-src 'self' blob:;",
      "script-src 'self' blob: 'unsafe-inline' 'unsafe-eval';",
    )
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), devCsp],
  base: './',
  root: path.resolve(__dirname, 'src/renderer'),
  publicDir: path.resolve(__dirname, 'public'),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/renderer"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
})
