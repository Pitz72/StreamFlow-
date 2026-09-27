import { defineConfig } from 'vitest/config'

// Configurazione separata da vite.config.mts: quella ha root in src/renderer
// (serve al bundle dell'interfaccia), i test invece coprono anche il main.
export default defineConfig({
  test: {
    root: '.',
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    // I log di StreamManager servono solo quando un test fallisce.
    silent: 'passed-only',
  },
})
