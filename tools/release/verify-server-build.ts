import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Compile the emitted modules with the deployment runtime without executing
// application code or contacting its services. A successful bundle can still
// contain invalid exports (TanStack/router#8031, rolldown/rolldown#10743).
const directory = resolve(process.argv[2] ?? '.vercel/output/functions')
const modules = readdirSync(directory, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(?:cjs|mjs|js)$/u.test(entry.name))
  .map(entry => join(entry.parentPath, entry.name))
  .sort()

if (modules.length === 0) throw new Error(`server_build_modules_missing:${directory}`)

for (const path of modules) {
  const checked = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' })
  if (checked.error !== undefined) throw checked.error
  if (checked.status !== 0) process.exit(checked.status ?? 1)
}

process.stdout.write(`SERVER_BUILD_SYNTAX_PASS modules=${modules.length}\n`)
