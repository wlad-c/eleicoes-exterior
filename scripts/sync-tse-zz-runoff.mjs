#!/usr/bin/env node
/**
 * Sync runoff (2º turno) overseas tallies from TSE EA20 election 6258.
 * Thin wrapper around sync-tse-zz.mjs --turno=2.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(
  process.execPath,
  [join(__dirname, 'sync-tse-zz.mjs'), '--turno=2', ...process.argv.slice(2)],
  { stdio: 'inherit' },
)
process.exit(r.status ?? 1)
