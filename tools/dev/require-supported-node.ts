#!/usr/bin/env node
/**
 * Preflight for Convex CLI scripts (`check:convex-codegen`, `generate:convex`).
 *
 * Papercut this removes: with an unsupported default runtime (e.g. nvm default
 * v25) these commands previously crashed deep inside Convex internals with a
 * stack trace that pointed nowhere near the cause. This guard turns that into
 * one actionable line plus the exact remedy, then executes the requested
 * command transparently on a suitable runtime.
 *
 * The project supports Node 22, matching .nvmrc and engines.node.
 */
import { spawnSync } from 'node:child_process'
import { delimiter, dirname } from 'node:path'
import { argv, env, exit } from 'node:process'

const SEPARATOR_INDEX = argv.indexOf('--')
const PASSTHROUGH: string[] = SEPARATOR_INDEX === -1 ? [] : argv.slice(SEPARATOR_INDEX + 1)
const INVOKED_AS = env.npm_lifecycle_event ?? 'this script'

function currentMajor(): number {
  const match = /^v(\d+)\./u.exec(process.version)
  return match === null ? Number.NaN : Number(match[1])
}

const major = currentMajor()

if (major !== 22) {
  const lines = [
    '',
    `✖ ${INVOKED_AS}: this project requires Node 22; found ${process.version}.`,
    '  Repo pin: engines.node = 22.x.',
    '',
    '  Run nvm use from the project directory, then retry.',
    '  For agent shells without NVM loaded:',
    '    NODE_VERSION=22 "$HOME/.nvm/nvm-exec" ' + (env.npm_lifecycle_event === undefined ? '<command> [args...]' : `npm run ${INVOKED_AS}`),
    '',
    '  Command skipped: ' + PASSTHROUGH.join(' '),
    '',
  ]
  console.error(lines.join('\n'))
  exit(1)
}

if (PASSTHROUGH.length === 0) {
  console.error('require-supported-node.ts requires "-- <command...>"')
  exit(1)
}

const ran = spawnSync(PASSTHROUGH[0] ?? '', PASSTHROUGH.slice(1), {
  env: { ...env, PATH: [dirname(process.execPath), env.PATH].filter(Boolean).join(delimiter) },
  stdio: 'inherit',
  shell: false,
})

if (ran.error !== undefined) {
  console.error(`✖ failed to launch ${PASSTHROUGH[0]}: ${String(ran.error.message ?? ran.error)}`)
  exit(1)
}

exit(ran.status ?? 1)
