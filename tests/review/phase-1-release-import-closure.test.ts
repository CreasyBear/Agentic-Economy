import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const legacyModuleImport = /modules\/(?:answer(?:-thread)?|external-run|harness)(?:\/|['"])/u

describe('Phase 1 repair acceptance — CLI import closure', () => {
  it('proves the repaired source-file scan misses a transitive legacy dependency bundled into the CLI', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'ae-phase-1-import-closure-'))
    mkdirSync(join(fixture, 'tools', 'ae'), { recursive: true })
    mkdirSync(join(fixture, 'src', 'modules', 'answer'), { recursive: true })
    writeFileSync(join(fixture, 'tools', 'ae', 'cli.ts'), "import { bridge } from '../../src/bridge'\nconsole.log(bridge)\n")
    writeFileSync(join(fixture, 'src', 'bridge.ts'), "export { legacy as bridge } from './modules/answer/index'\n")
    writeFileSync(join(fixture, 'src', 'modules', 'answer', 'index.ts'), "export const legacy = 'legacy answer module'\n")

    const repairedGateInputs = globSync('tools/ae/**/*.ts', { cwd: fixture })
    expect(repairedGateInputs.filter((path) => (
      legacyModuleImport.test(readFileSync(join(fixture, path), 'utf8'))
    ))).toEqual([])

    const bundle = await build({
      absWorkingDir: fixture,
      entryPoints: ['tools/ae/cli.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      legalComments: 'none',
      write: false,
    })
    expect(bundle.outputFiles).toHaveLength(1)
    expect(legacyModuleImport.test(bundle.outputFiles[0]!.text)).toBe(true)
  })

  it('confirms the repaired production gate no longer inspects the freshly built CLI bundle', () => {
    const gateSource = readFileSync('tests/imports/operation-product-legacy-independence.test.ts', 'utf8')
    expect(gateSource).not.toContain("'packages/cli/dist/ae.js'")
    expect(gateSource).toContain("...globSync('tools/ae/**/*.ts')")
  })
})
