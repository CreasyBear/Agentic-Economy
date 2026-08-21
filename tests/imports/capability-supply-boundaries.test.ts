import { globSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import * as ts from 'typescript'
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
  it('keeps Answer and Customer Request discovery behind market seams', () => {
    const paths = [
      ...listTsFiles('src/modules/answer'),
      ...globSync(join('src/modules/answer', '**/*.tsx')).sort(),
    ]
    for (const path of paths) {
      const sourceFile = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        false,
        path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      const moduleSpecifiers = sourceFile.statements.flatMap((statement) =>
        (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
          && statement.moduleSpecifier !== undefined
          && ts.isStringLiteral(statement.moduleSpecifier)
          ? [statement.moduleSpecifier.text]
          : [],
      )
      for (const specifier of moduleSpecifiers) {
        const normalizedTarget = (
          specifier.startsWith('@/') || specifier.startsWith('~/') ? `src/${specifier.slice(2)}` :
          specifier.startsWith('.') ? relative(process.cwd(), resolve(dirname(path), specifier)) :
          specifier
        )
          .replaceAll('\\', '/')
          .replace(/\.(?:ts|tsx|js|jsx)$/, '')
        expect(normalizedTarget, path).not.toBe('src/modules/capability-supply')
        expect(normalizedTarget, path).not.toMatch(/^src\/modules\/capability-supply\//)
        expect(normalizedTarget, path).not.toBe('src/modules/registry/registry.functions')
      }
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
})

function sources(): string[] {
  return [
    ...neutralSources.map((path) => readFileSync(path, 'utf8')),
    ...deepenedFolders.flatMap((directory) => listTsFiles(directory).map((path) => readFileSync(path, 'utf8'))),
  ]
}

