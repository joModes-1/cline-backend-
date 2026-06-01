/**
 * Production bootstrap for the Villa backend.
 *
 * tsx on Node 22+ requires --import (not --loader/register).
 * We use tsconfig-paths to resolve @/* aliases at runtime.
 *
 * Run via: node --import tsx/esm bootstrap.mjs
 */

import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Register tsconfig-paths so @/* etc. resolve against tsconfig.json.
// tsconfig-paths is a CommonJS module; use createRequire to load it.
const require = createRequire(import.meta.url)
const tsConfigPaths = require('tsconfig-paths')
const tsconfig = require('./tsconfig.json')
tsConfigPaths.register({
  baseUrl: '.',
  paths: tsconfig.compilerOptions.paths,
})

// Boot the server (tsx/esm loader registered via --import flag).
await import('./src/villa-server.ts')
