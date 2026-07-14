/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{ts,tsx,html}'
  ],
  theme: {
    extend: {
      colors: {
        // Sistema "Deco Dial". I colori tematizzabili (che cambiano tra tema
        // scuro e chiaro) sono esposti come CSS variables in formato "R G B"
        // così i modificatori di opacità Tailwind (es. bg-deco-surface/60,
        // border-deco-brass/35) continuano a funzionare. Vedi index.css.
        deco: {
          bg: 'rgb(var(--deco-bg) / <alpha-value>)',
          surface: 'rgb(var(--deco-surface) / <alpha-value>)',
          panel: 'rgb(var(--deco-panel) / <alpha-value>)',
          panel2: 'rgb(var(--deco-panel2) / <alpha-value>)',
          ink: 'rgb(var(--deco-ink) / <alpha-value>)',
          inkStrong: 'rgb(var(--deco-ink-strong) / <alpha-value>)',
          inkDim: 'rgb(var(--deco-ink-dim) / <alpha-value>)',
          brass: 'rgb(var(--deco-brass) / <alpha-value>)',
          brassLabel: 'rgb(var(--deco-brass-label) / <alpha-value>)',
          // Colori di stato/accento: costanti tra i due temi.
          onair: '#E0483A',
          onairDeep: '#B8302A',
          onairDark: '#8F2418',
          warn: '#E0B23A',
          error: '#E0742A',
          success: '#3D8A7F',
          successDeep: '#2E6A61',
          metadata: '#7C58A8',
          metadataInk: '#C4A9E0',
        },
      },
      fontFamily: {
        display: ['"Poiret One"', 'system-ui', 'sans-serif'],
        ui: ['Oswald', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
