import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const toolPath = fileURLToPath(new URL('../../../tools/dev/papercut.mjs', import.meta.url))
const usage = 'Usage: npm run papercut -- -m <model> "message"'

describe('papercut logger', () => {
  it('appends one multiline item and rejects invalid arguments without touching the ledger', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agentic-economy-papercut-'))
    const ledgerPath = join(directory, 'PAPERCUTS.md')
    const initial = '# Papercuts\n\n7. Existing: keep this\n'
    writeFileSync(ledgerPath, initial)
    const env = { ...process.env, PAPERCUT_LEDGER_PATH: ledgerPath }

    try {
      const appended = spawnSync(
        process.execPath,
        [toolPath, '--model', 'test-model', 'line one\n- special\n8. nested'],
        { cwd: process.cwd(), encoding: 'utf8', env },
      )

      expect(appended.status).toBe(0)
      expect(appended.stderr).toBe('')
      const logged = readFileSync(ledgerPath, 'utf8')
      expect(logged).toBe(
        `${initial}\n8. test-model: line one\n   - special\n   8. nested\n`,
      )

      const beforeRejected = logged
      const unknown = spawnSync(
        process.execPath,
        [toolPath, '--unknown', 'test-model', 'message'],
        { cwd: process.cwd(), encoding: 'utf8', env },
      )
      const missing = spawnSync(process.execPath, [toolPath, '-m', 'test-model'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env,
      })

      expect(unknown.status).toBe(1)
      expect(unknown.stderr).toBe(`${usage}\n`)
      expect(missing.status).toBe(1)
      expect(missing.stderr).toBe(`${usage}\n`)
      expect(readFileSync(ledgerPath, 'utf8')).toBe(beforeRejected)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
