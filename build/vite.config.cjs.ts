/**
 * Vite configuration for CommonJS build
 * Output: dist/cjs/
 */

import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [],

  build: {
    lib: {
      entry: resolve(__dirname, '../src/lib/index.ts'),
      formats: ['cjs']
    },
    outDir: resolve(__dirname, '../dist/cjs'),
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['pako', 'ts-md5'],
      output: {
        format: 'cjs',
        preserveModules: true,
        preserveModulesRoot: 'src/lib',
        entryFileNames: '[name].cjs',
        exports: 'named'
      }
    }
  }
})
