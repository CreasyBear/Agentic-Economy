import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as lockfile from 'proper-lockfile'
import { afterEach, describe, expect, it } from 'vitest'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function run(dir: string, i: number): Promise<number | null> {
  const code = `import('./tools/ae/lib/config.ts').then(m => m.rememberChatThread('https://h${i}.example', 't${i}'))`
  return new Promise((resolve) => {
    spawn('npx', ['tsx', '-e', code], { env: { ...process.env, AE_CONFIG_DIR: dir }, stdio: 'ignore' }).on('exit', resolve)
  })
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('ae config lock', () => {
  it('waits for a held lock, then both mutations survive', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ae-cfg-'))
    dirs.push(dir)
    const release = await lockfile.lock(dir, { realpath: false })
    const first = run(dir, 0)
    await sleep(4000)
    expect(existsSync(join(dir, 'config.json'))).toBe(false)
    await release()
    expect(await first).toBe(0)
    expect(await Promise.all([run(dir, 1), run(dir, 2)])).toEqual([0, 0])
    const ids = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).lastThreadIds
    expect(Object.keys(ids)).toHaveLength(3)
  }, 60_000)
})
