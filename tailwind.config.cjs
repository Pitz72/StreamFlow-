/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{ts,tsx,html}'
  ],
  theme: {
    extend: {
      colors: {
        // Sistema "Essenziale" (0.10): il verde Runtime portato quasi al nero,
        // nel linguaggio di Runtime Live Machine Pro. Solo tema scuro. I colori
        // sono CSS variables in formato "R G B", così i modificatori di opacità
        // Tailwind (bg-sf-green/20) funzionano. Vedi index.css.
        sf: {
          bg: 'rgb(var(--sf-bg) / <alpha-value>)',
          surface: 'rgb(var(--sf-surface) / <alpha-value>)',
          raised: 'rgb(var(--sf-raised) / <alpha-value>)',
          sunken: 'rgb(var(--sf-sunken) / <alpha-value>)',
          line: 'rgb(var(--sf-line) / <alpha-value>)',
          lineStrong: 'rgb(var(--sf-line-strong) / <alpha-value>)',
          ink: 'rgb(var(--sf-ink) / <alpha-value>)',
          inkSoft: 'rgb(var(--sf-ink-soft) / <alpha-value>)',
          inkDim: 'rgb(var(--sf-ink-dim) / <alpha-value>)',
          inkFaint: 'rgb(var(--sf-ink-faint) / <alpha-value>)',
          // Verde Runtime: segnale (testo, spie), fondo petrolio, pulsante pieno.
          green: 'rgb(var(--sf-green) / <alpha-value>)',
          greenDeep: 'rgb(var(--sf-green-deep) / <alpha-value>)',
          greenStrong: 'rgb(var(--sf-green-strong) / <alpha-value>)',
          // Testi di stato, chiari quanto basta per il contrasto sul fondo scuro.
          redInk: 'rgb(var(--sf-red-ink) / <alpha-value>)',
          amberInk: 'rgb(var(--sf-amber-ink) / <alpha-value>)',
          cyanInk: 'rgb(var(--sf-cyan-ink) / <alpha-value>)',
          violetInk: 'rgb(var(--sf-violet-ink) / <alpha-value>)',
          track: 'rgb(var(--sf-track) / <alpha-value>)',
          // Pieni di stato.
          onair: '#D93A2C',
          onairEdge: '#F06A5D',
          amber: '#F2B33D',
          cyan: '#3EC6E0',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
