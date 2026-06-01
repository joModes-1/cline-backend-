/**
 * Production bootstrap for the Villa backend.
 *
 * Why this file exists:
 *   tsx 4.x's built-in path-alias resolver (`resolveTsPaths`) has issues
 *   resolving the @/shared, @/utils, @/hosts etc. imports under Node 22+
 *   ESM in some environments (Render, in particular). tsconfig-paths is a
 *   robust runtime resolver that's been the standard for years.
 *
 * What we do:
 *   1. Register tsx as the TypeScript loader (so .ts files work).
 *   2. Register tsconfig-paths to handle the @/* etc. path aliases.
 *   3. Import the actual server entry.
 *
 * Run via: `node bootstrap.mjs` (NOT tsx — this file is .mjs, plain ESM).
 */

import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

// 1. Register tsx as the loader so subsequent .ts imports compile on-the-fly.
register('tsx/esm', pathToFileURL('./'))

// 2. Register tsconfig-paths so @/* etc. resolve against tsconfig.json.
//    tsconfig-paths is a CommonJS module; use createRequire to load it.
const require = createRequire(import.meta.url)
const tsConfigPaths = require('tsconfig-paths')
const tsconfig = require('./tsconfig.json')
tsConfigPaths.register({
  baseUrl: '.',
  paths: tsconfig.compilerOptions.paths,
})

// 3. Boot the server.
await import('./src/villa-server.ts')
