import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  bundledCliInputs,
  legacyInputs,
  legacyModuleImport,
} from '../imports/support/operation-product-dependency-closure'

describe('Phase 1 repair acceptance — CLI import closure', () => {
  it('rejects a transitive legacy dependency bundled into the CLI', async () => {
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

    const closure = await bundledCliInputs('tools/ae/cli.ts', fixture)
    expect(legacyInputs(closure)).toEqual(['src/modules/answer/index.ts'])
  })

  it('confirms the production gate is hermetic and closure-aware', () => {
    const gateSource = readFileSync('tests/imports/operation-product-legacy-independence.test.ts', 'utf8')
    expect(gateSource).not.toContain("'packages/cli/dist/ae.js'")
    expect(gateSource).toContain("...globSync('tools/ae/**/*.ts')")
    expect(gateSource).toContain("bundledCliInputs('tools/ae/cli.ts')")
    expect(gateSource).toContain('legacyInputs(cliInputs)')
  })
})
