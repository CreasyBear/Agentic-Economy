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
 * Suitable runtimes today: majors 18 through 24 (repo engines pins 22.x;
 * 24 is the blessed fallback via `npx -y -p node@24`).
 */
import { spawnSync } from 'node:child_process'
import { argv, env, exit } from 'node:process'

const SEPARATOR_INDEX = argv.indexOf('--')
const PASSTHROUGH = SEPARATOR_INDEX === -1 ? [] : argv.slice(SEPARATOR_INDEX + 1)
const INVOKED_AS = env.npm_lifecycle_event ?? 'this script'

const SUPPORTED_MAJORS = new Set([18, 20, 22, 23, 24])

function currentMajor() {
  const match = /^v(\d+)\./u.exec(process.version)
  return match === null ? Number.NaN : Number(match[1])
}

const major = currentMajor()

if (!SUPPORTED_MAJORS.has(major)) {
  const lines = [
    '',
    `✖ ${INVOKED_AS}: Node ${process.version} is not supported by the Convex CLI.`,
    '  Repo pin: engines.node = 22.x.',
    '',
    '  Remediate one of:',
    '    • nvm use            (project .nvmrc will select 22)',
    '    • npx -y -p node@24 npm run ' + INVOKED_AS,
    '',
    '  Command skipped: ' + PASSTHROUGH.join(' '),
    '',
  ]
  console.error(lines.join('\n'))
  exit(1)
}

if (PASSTHROUGH.length === 0) {
  console.error('require-supported-node.mjs requires "-- <command...>"')
  exit(1)
}

const ran = spawnSync(PASSTHROUGH[0] ?? '', PASSTHROUGH.slice(1), {
  stdio: 'inherit',
  shell: false,
})

if (ran.error !== undefined) {
  console.error(`✖ failed to launch ${PASSTHROUGH[0]}: ${String(ran.error.message ?? ran.error)}`)
  exit(1)
}

exit(ran.status ?? 1)
