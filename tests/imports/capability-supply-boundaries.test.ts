import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../helpers/source-files'

const neutralSources = [
  'src/modules/capability-supply/public.ts',
  'src/modules/capability-supply/internal/convex-schema.ts',
  'convex/capabilitySupply.ts',
] as const

const deepenedFolders = [
  'src/modules/capability-supply/internal/offering',
  'src/modules/capability-supply/internal/binding',
  'src/modules/capability-supply/internal/eligibility',
  'src/modules/capability-supply/internal/quarantine',
  'src/modules/capability-supply/internal/publication',
  'src/modules/capability-supply/internal/shared',
  'src/modules/capability-supply/internal/operation-ledger',
] as const

describe('capability supply boundaries', () => {
  it('does not import or fall back to V1 Request, catalog or routing binding authorities', () => {
    for (const source of sources()) {
      const legacyAuthorityImport = /from\s+['"][^'"]*(?:customer-request|catalog|routing-kernel|routingKernelBindings)[^'"]*['"]/
      expect(source).not.toMatch(legacyAuthorityImport)
    }
  })

  it('does not inspect adapter configuration keys in neutral registration or eligibility code', () => {
    const keyInspection = /(?:Object\.(?:keys|entries)|Reflect\.get)\([^)]*config|JSON\.parse\([^)]*config|\.config\s*(?:\[|\.)/
    for (const source of sources()) expect(source).not.toMatch(keyInspection)
  })

  it('does not admit operation or vertical business vocabulary into the V2 supply shape', () => {
    for (const source of sources()) {
      const neutralShape = source.replace(
        /operation:\s*v\.object\(\{\s*path:\s*v\.string\(\),\s*method:\s*v\.union\(v\.literal\('get'\),\s*v\.literal\('post'\)\)\s*\}\)/,
        '',
      )
      expect(neutralShape).not.toMatch(/(?:^|[,{]\s*)operation\s*:/m)
      expect(source).not.toMatch(/\b(?:shipping|booking|restaurant|accommodation|purchase)\b/i)
    }
  })

  it('forces sandbox identity, publication, and eligibility through shared production commands', () => {
    const seed = readFileSync('convex/devSeed.ts', 'utf8')

    expect(seed).toContain('claimBusinessCommand')
    expect(seed).toContain('publishBusinessCatalogCommand')
    expect(seed).toContain('setCapabilitySupplyEligibilityCommand')
    expect(seed).not.toMatch(/ctx\.db\.(?:insert|patch|replace)|db\.(?:insert|patch|replace)\(['"](?:businesses|claims|businessOfferings|capabilityOfferings|capabilityTransportBindings)['"]/)
  })

  it('keeps publication importers production-owned and fixture-independent', () => {
    const importer = readFileSync('src/modules/capability-supply/internal/publication-importers.ts', 'utf8')
    expect(importer).not.toMatch(/tests\/|fixtures\/|examples\/|devSeed|sandbox-supply|provider-integrations/)
    expect(importer).not.toMatch(/from\s+['"][^'"]*(?:customer-request|routing-kernel|catalog)[^'"]*['"]/)
    expect(importer).not.toMatch(/\bfetch\s*\(/)
  })

  it('uses generated private Convex references and keeps each readiness probe one-shot', () => {
    const readiness = readFileSync('convex/capabilitySupplyReadiness.ts', 'utf8')

    expect(readiness).toContain("import { internal } from './_generated/api'")
    expect(readiness).toContain('internal.capabilitySupply.readCapabilityProbeTarget')
    expect(readiness).toContain('internal.capabilitySupply.recordCapabilityProbeResult')
    expect(readiness).not.toMatch(/ctx\.scheduler\.runAfter[\s\S]*internal\.capabilitySupplyReadiness\.probe/)
    expect(readiness).not.toContain('makeFunctionReference')
  })
})

function sources(): string[] {
  return [
    ...neutralSources.map((path) => readFileSync(path, 'utf8')),
    ...deepenedFolders.flatMap((directory) => listTsFiles(directory).map((path) => readFileSync(path, 'utf8'))),
  ]
}


