// Tests de la matemática de plata (src/__tests__/): congelan los números de
// liquidaciones, tarifas, costos de tarja y cuenta del cliente. Corren DENTRO
// del build (`npm run build`) — si una fórmula cambia un número, el deploy
// no sale hasta que alguien mire por qué.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  // Los tests no usan variables de entorno; apuntar envDir a un directorio
  // sin .env evita que Vite intente leer .env.local — acá es un symlink a
  // ~/Documents (fuera del repo) y según los permisos de macOS del shell esa
  // lectura puede tirar EPERM y voltear la suite entera al arrancar.
  envDir: path.resolve(__dirname, 'src/__tests__'),
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
