import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function run(dir: string, i: number): Promise<number | null> {
  const code = `import('./tools/ae/lib/config.ts').then(m => m.rememberChatThread('https://h${i}.example', 't${i}'))`
  return new Promise((resolve) => {
    spawn('npx', ['tsx', '-e', code], { env: { ...process.env, AE_CONFIG_DIR: dir }, stdio: 'ignore' }).on('exit', resolve)
  })
}

describe('ae config lock', () => {
  it('keeps every key from concurrent mutations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ae-cfg-'))
    dirs.push(dir)
    const codes = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => run(dir, i)))
    expect(codes).toEqual([0, 0, 0, 0, 0, 0])
    const ids = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).lastThreadIds
    expect(Object.keys(ids)).toHaveLength(6)
  }, 60_000)
})
