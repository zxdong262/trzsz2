/**
 * Unified build script for trzsz2 using Vite
 *
 * This script runs all Vite builds in sequence:
 * 1. ESM build (tree-shakeable)
 * 2. CJS build (CommonJS modules)
 * 3. CJS-full build (bundled CommonJS)
 * 4. Browser build (IIFE format)
 *
 * Also creates necessary package.json files for each output.
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const distDir = join(rootDir, 'dist')

console.log('🚀 Starting trzsz2 build process...\n')

/**
 * Clean the dist directory
 */
function cleanDist () {
  console.log('📦 Cleaning dist directory...')
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true })
  }
  mkdirSync(distDir, { recursive: true })
  console.log('   ✓ dist directory cleaned\n')
}

/**
 * Run a Vite build with the specified config
 * @param {string} configPath - Path to the Vite config file
 * @param {string} label - Label for logging
 */
function runViteBuild (configPath, label) {
  console.log(`📚 Building ${label}...`)
  try {
    execSync(`npx vite build --config ${configPath}`, {
      cwd: rootDir,
      stdio: 'inherit'
    })
    console.log(`   ✓ ${label} build complete\n`)
  } catch (error) {
    console.error(`   ✗ ${label} build failed`)
    throw error
  }
}

/**
 * Create package.json files for each output directory
 */
function createPackageJsonFiles () {
  console.log('📝 Creating package.json files...')

  // ESM package.json
  writeFileSync(
    join(distDir, 'esm', 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2)
  )

  // CJS package.json
  writeFileSync(
    join(distDir, 'cjs', 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2)
  )

  // CJS-full package.json
  writeFileSync(
    join(distDir, 'cjs-full', 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2)
  )

  console.log('   ✓ Package.json files created\n')
}

/**
 * Copy declaration files to dist root for backward compatibility
 */
function copyDeclarationFiles () {
  console.log('📋 Copying declaration files to dist root...')

  const esmDir = join(distDir, 'esm')

  function copyDtsFiles (srcDir, destDir) {
    const entries = readdirSync(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name)
      const destPath = join(destDir, entry.name)

      if (entry.isDirectory()) {
        if (!existsSync(destPath)) {
          mkdirSync(destPath, { recursive: true })
        }
        copyDtsFiles(srcPath, destPath)
      } else if (entry.name.endsWith('.d.ts')) {
        if (!existsSync(dirname(destPath))) {
          mkdirSync(dirname(destPath), { recursive: true })
        }
        copyFileSync(srcPath, destPath)
        console.log(`   Copied: dist/${entry.name}`)
      }
    }
  }

  copyDtsFiles(esmDir, distDir)
  console.log('   ✓ Declaration files copied\n')
}

/**
 * Build minified browser version
 */
function buildMinifiedBrowser () {
  console.log('📚 Building minified browser bundle...')
  try {
    execSync('npx esbuild dist/browser/trzsz2.js --minify --outfile=dist/browser/trzsz2.min.js', {
      cwd: rootDir,
      stdio: 'inherit'
    })
    console.log('   ✓ Minified browser build complete\n')
  } catch (error) {
    console.error('   ✗ Minified browser build failed')
    throw error
  }
}

// Run the build
try {
  cleanDist()

  // Run all Vite builds
  runViteBuild('build/vite.config.esm.ts', 'ESM')
  runViteBuild('build/vite.config.cjs.ts', 'CJS')
  runViteBuild('build/vite.config.cjs-full.ts', 'CJS-full')
  runViteBuild('build/vite.config.browser.ts', 'Browser')

  // Build minified browser version
  buildMinifiedBrowser()

  // Create package.json files
  createPackageJsonFiles()

  // Copy declaration files to dist root
  copyDeclarationFiles()

  console.log('✅ Build complete!')
  console.log('\nOutput directories:')
  console.log('  - dist/esm       : ES modules (tree-shakeable)')
  console.log('  - dist/cjs       : CommonJS modules')
  console.log('  - dist/cjs-full  : CommonJS bundle (all dependencies included)')
  console.log('  - dist/browser   : Browser bundle (IIFE format)')
} catch (error) {
  console.error('❌ Build failed:', error.message)
  process.exit(1)
}
