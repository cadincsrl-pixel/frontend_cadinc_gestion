// Tests de la matemática de plata (src/__tests__/): congelan los números de
// liquidaciones, tarifas, costos de tarja y cuenta del cliente. Corren DENTRO
// del build (`npm run build`) — si una fórmula cambia un número, el deploy
// no sale hasta que alguien mire por qué.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
