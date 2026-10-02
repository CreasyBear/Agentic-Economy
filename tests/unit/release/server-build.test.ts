import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const script = resolve('tools/release/verify-server-build.ts')
const directories: string[] = []

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ae-server-build-'))
  directories.push(directory)
  return directory
}

function verify(directory: string) {
  return spawnSync(process.execPath, [script, directory], { encoding: 'utf8' })
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true })
})

describe('emitted server module validation', () => {
  it('rejects the undeclared export that otherwise survives a successful bundle', () => {
    const directory = fixture()
    mkdirSync(join(directory, '_ssr'))
    writeFileSync(join(directory, '_ssr', 'ssr.mjs'), 'export { ssr_exports };\n')

    const result = verify(directory)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Export 'ssr_exports' is not defined")
    expect(result.stdout).not.toContain('SERVER_BUILD_SYNTAX_PASS')
  })

  it('accepts valid modules without executing their startup effects', () => {
    const directory = fixture()
    const marker = join(directory, 'must-not-exist')
    writeFileSync(join(directory, 'entry.mjs'), [
      "import { writeFileSync } from 'node:fs';",
      `writeFileSync(${JSON.stringify(marker)}, 'executed');`,
      'export const handler = () => new Response("ready");',
    ].join('\n'))
    writeFileSync(join(directory, 'dependency.cjs'), 'module.exports = {};\n')

    const result = verify(directory)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('SERVER_BUILD_SYNTAX_PASS modules=2')
    expect(existsSync(marker)).toBe(false)
  })

  it('refuses absent and empty build output', () => {
    const directory = fixture()
    expect(verify(join(directory, 'missing')).status).toBe(1)
    const result = verify(directory)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('server_build_modules_missing')
  })
})
