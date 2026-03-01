import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: 'src/web-demo',
  resolve: {
    alias: {
      trzsz2: resolve(__dirname, '../lib/index.ts')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/terminal': {
        target: 'ws://localhost:8081',
        ws: true
      }
    }
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true
  }
})
