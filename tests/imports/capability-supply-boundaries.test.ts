import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../helpers/source-files'

const neutralSources = [
  'src/modules/capability-supply/public.ts',
  'src/modules/capability-supply/internal/convex-schema.ts',
  'convex/capabilitySupply.ts',
  'convex/capabilitySupplyShared.ts',
  'convex/capabilitySupplyPublish.ts',
  'convex/capabilitySupplyProbes.ts',
  'convex/capabilitySupplyGraph.ts',
  'convex/capabilitySupplyLists.ts',
  'convex/capabilitySupplyCommands.ts',
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
  it('keeps CDP native loading isolated from optional x402 SVM peers', () => {
    const signer = readFileSync(
      'src/modules/capability-supply/internal/cdp-x402-payment-signer.ts',
      'utf8',
    )
    const convexConfiguration = JSON.parse(readFileSync('convex.json', 'utf8')) as {
      node?: { externalPackages?: unknown }
    }
    const packageConfiguration = JSON.parse(readFileSync('package.json', 'utf8')) as Record<
      string,
      Record<string, unknown> | undefined
    >

    expect(signer).not.toContain('@coinbase/cdp-sdk/x402')
    expect(convexConfiguration.node?.externalPackages).toEqual(['@coinbase/cdp-sdk'])
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      expect(packageConfiguration[field]?.['@x402/svm']).toBeUndefined()
    }
  })

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
      expect(source).not.toMatch(/(?:^|[,{]\s*)operation\s*:/m)
      expect(source).not.toMatch(/\b(?:shipping|booking|restaurant|accommodation|purchase)\b/i)
    }
  })

  it('keeps the development seed on current catalog commands and out of retired claim paths', () => {
    const seed = readFileSync('convex/devSeed.ts', 'utf8')

    expect(seed).toContain('persistDevSeedCatalogState')
    expect(seed).toContain('rebuildBusinessSupplyProjectionSnapshotCommand')
    expect(seed).not.toContain('claimBusinessCommand')
    expect(seed).not.toContain('publishBusinessCatalogCommand')
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

  it('keeps active detail parity on the bounded active-first index', () => {
    const schema = readFileSync('src/modules/capability-supply/internal/convex-schema.ts', 'utf8')
    const projection = readFileSync('convex/capabilitySupplyOperationProjection.ts', 'utf8')

    expect(schema).toMatch(/capabilityCurrentOperationDetails:[\s\S]*\.index\('by_active_and_operationRef', \['active', 'operationRef'\]\)/)
    expect(projection).toMatch(/query\('capabilityCurrentOperationDetails'\)[\s\S]*?\.withIndex\('by_active_and_operationRef', \(query\) => query\.eq\('active', true\)\)[\s\S]*?\.take\(258\)/)
    expect(projection).not.toContain(".filter((query) => query.eq(query.field('active'), true))")
  })
})

function sources(): string[] {
  return [
    ...neutralSources.map((path) => readFileSync(path, 'utf8')),
    ...deepenedFolders.flatMap((directory) => listTsFiles(directory).map((path) => readFileSync(path, 'utf8'))),
  ]
}
