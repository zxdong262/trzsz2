import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    exclude: ['test/integration/**/*', 'temp/**/*']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})
