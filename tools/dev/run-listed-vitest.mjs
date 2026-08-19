import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const files = process.argv.slice(2)
const missing = files.filter((file) => !existsSync(resolve(PROJECT_ROOT, file)))
if (missing.length > 0) {
  console.error(`listed vitest path missing:\n${missing.join('\n')}`)
  process.exit(1)
}

const child = spawn(
  process.execPath,
  ['tools/dev/run-with-cleanup.mjs', 'vitest', 'run', ...files],
  { cwd: PROJECT_ROOT, stdio: 'inherit', env: process.env },
)
child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
