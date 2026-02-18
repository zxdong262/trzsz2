/**
 * Vite configuration for ESM build (tree-shakeable)
 * Output: dist/esm/
 */

import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      outDir: 'dist/esm',
      entryRoot: 'src',
      rollupTypes: false,
      tsconfigPath: './tsconfig.json'
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, '../src/index.ts'),
      formats: ['es']
    },
    outDir: resolve(__dirname, '../dist/esm'),
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['pako', 'ts-md5'],
      output: {
        format: 'es',
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        exports: 'named'
      }
    }
  }
})
