import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  PROTECTED_SURFACE_MANIFEST,
  verifyProtectedSurfaceManifest,
  type MeasuredProtectedSurfaceInventory,
  type ProtectedSurfaceManifestRow,
} from '../../src/lib/server/authority-boundary/protected-surface-manifest'

type PublicInventory = Readonly<{
  http: readonly Readonly<{ id: string }>[]
  mcp: readonly Readonly<{ actionId: string }>[]
  cli: readonly Readonly<{ command: string }>[]
}>

const contractRoot = resolve(process.cwd(), '.planning/maturity-execution/contracts')
const publicInventory = JSON.parse(readFileSync(resolve(contractRoot, 'public-surface-inventory.json'), 'utf8')) as PublicInventory
type MeasuredRow = MeasuredProtectedSurfaceInventory['convexHttpActions'][number]
type CandidateInventory = Omit<MeasuredProtectedSurfaceInventory, 'convexHttpRoutes'> & Readonly<{
  baselineCounts: Readonly<Record<string, number>>
  candidateCounts: Readonly<Record<string, number>>
  convexHttpRoutes: readonly (MeasuredRow & Readonly<{ handlerRef: string }>)[]
  backgroundDiscovery: Readonly<{ discoveryKinds: readonly string[]; callSiteCount: number }>
}>
const measuredInventory = JSON.parse(readFileSync(
  resolve(contractRoot, 'phase-2-protected-surfaces.json'),
  'utf8',
)) as CandidateInventory
const classifications = JSON.parse(readFileSync(
  resolve(contractRoot, 'phase-2-protected-surfaces.classifications.json'),
  'utf8',
)) as Readonly<{ rows: Readonly<Record<string, unknown>> }>
type SinkTestRow = Readonly<{
  status: 'covered' | 'red'
  surfaceRef?: string
  testFile?: string
  testName?: string
  sha256?: string
  invocation?: Readonly<{ kind: string; target: string; expression: string }>
  authorityPathSha256?: string
  reason?: string
}>
type SinkTestRegistry = Readonly<{
  format: string
  inventorySha256: string
  rows: Readonly<Record<string, SinkTestRow>>
}>
const sinkTestRegistry = JSON.parse(readFileSync(
  resolve(contractRoot, 'phase-2-authority-sink-runtime-tests.json'),
  'utf8',
)) as SinkTestRegistry

function refs(kind: ProtectedSurfaceManifestRow['kind']): readonly string[] {
  return PROTECTED_SURFACE_MANIFEST
    .filter((row) => row.kind === kind)
    .map((row) => row.surfaceRef.slice(kind.length + 1))
    .sort()
}

function measuredRows(inventory: CandidateInventory = measuredInventory) {
  return [
    ...inventory.serverFunctions,
    ...inventory.publicConvex,
    ...inventory.convexHttpActions,
    ...inventory.convexHttpRoutes,
    ...inventory.crons,
    ...inventory.backgroundFamilies,
  ]
}

function expectMeasuredInventoryRejected(candidate: unknown): void {
  const directory = mkdtempSync(resolve(tmpdir(), 'ae-protected-surface-validation-'))
  try {
    const output = resolve(directory, 'candidate.json')
    writeFileSync(output, `${JSON.stringify(candidate, null, 2)}\n`)
    expect(() => execFileSync(
      '/Users/joelchan/.nvm/versions/node/v22.22.0/bin/node',
      ['tools/maturity/phase-2-protected-surfaces.mjs', '--validate-only', '--require-bound', '--output', output],
      { cwd: process.cwd(), stdio: 'pipe' },
    )).toThrow()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function expectSinkRegistryRejected(candidate: unknown): void {
  const directory = mkdtempSync(resolve(tmpdir(), 'ae-authority-sink-registry-validation-'))
  try {
    const registry = resolve(directory, 'candidate.json')
    writeFileSync(registry, `${JSON.stringify(candidate, null, 2)}\n`)
    expect(() => execFileSync(
      '/Users/joelchan/.nvm/versions/node/v22.22.0/bin/node',
      ['tools/maturity/phase-2-protected-surfaces.mjs', '--validate-sink-registry', '--registry', registry],
      { cwd: process.cwd(), stdio: 'pipe' },
    )).toThrow()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('Phase 2 generated protected-surface manifest', () => {
  it('indexes every authority sink by an exact runtime-handler test or an explicit RED gap', () => {
    const sinks = [...new Set(measuredRows()
      .map((row) => row.authoritySink)
      .filter((sink): sink is string => typeof sink === 'string'))].sort()
    expect(Object.keys(sinkTestRegistry.rows).sort()).toEqual(sinks)
    expect(sinks).toHaveLength(27)
    expect(Object.entries(sinkTestRegistry.rows)
      .filter(([, row]) => row.status === 'red')
      .map(([sink]) => sink).sort()).toEqual([])
    expect(() => execFileSync(
      '/Users/joelchan/.nvm/versions/node/v22.22.0/bin/node',
      ['tools/maturity/phase-2-protected-surfaces.mjs', '--validate-sink-registry'],
      { cwd: process.cwd(), stdio: 'pipe' },
    )).not.toThrow()
  })

  it('rejects missing, renamed, duplicated, forged, or stale runtime-handler test mappings', () => {
    const covered = Object.entries(sinkTestRegistry.rows).filter(([, row]) => row.status === 'covered')
    const first = covered[0]
    const second = covered[1]
    if (first === undefined || second === undefined) throw new Error('expected covered runtime sink tests')
    const firstTestFile = first[1].testFile
    const firstTestName = first[1].testName
    const secondSurfaceRef = second[1].surfaceRef
    if (firstTestFile === undefined || firstTestName === undefined || secondSurfaceRef === undefined) {
      throw new Error('covered runtime sink test fields missing')
    }

    const missing = structuredClone(sinkTestRegistry) as { rows: Record<string, SinkTestRow> }
    delete missing.rows[first[0]]
    expectSinkRegistryRejected(missing)

    const renamed = structuredClone(sinkTestRegistry) as { rows: Record<string, SinkTestRow> }
    renamed.rows[first[0]] = { ...first[1], testName: `${first[1].testName}:renamed` }
    expectSinkRegistryRejected(renamed)

    const duplicate = structuredClone(sinkTestRegistry) as { rows: Record<string, SinkTestRow> }
    duplicate.rows[second[0]] = {
      ...second[1],
      testFile: firstTestFile,
      testName: firstTestName,
    }
    expectSinkRegistryRejected(duplicate)

    const forgedSurface = structuredClone(sinkTestRegistry) as { rows: Record<string, SinkTestRow> }
    forgedSurface.rows[first[0]] = { ...first[1], surfaceRef: secondSurfaceRef }
    expectSinkRegistryRejected(forgedSurface)

    const staleChecksum = structuredClone(sinkTestRegistry) as { rows: Record<string, SinkTestRow> }
    staleChecksum.rows[first[0]] = { ...first[1], sha256: '0'.repeat(64) }
    expectSinkRegistryRejected(staleChecksum)
  })

  it('preserves frozen baseline counts separately from mechanically discovered candidate counts', () => {
    const inventory = measuredInventory as MeasuredProtectedSurfaceInventory & {
      baselineCounts?: Record<string, number>
      candidateCounts?: Record<string, number>
    }
    expect(inventory.baselineCounts).toMatchObject({
      serverFunctions: 43,
      publicConvex: 116,
      convexHttpActions: 1,
      crons: 10,
      backgroundFamilies: 25,
      frozenHttp: 39,
      frozenMcp: 14,
      frozenCli: 12,
    })
    expect(inventory.candidateCounts?.serverFunctions).toBe(inventory.serverFunctions.length)
    expect(inventory.candidateCounts?.publicConvex).toBe(inventory.publicConvex.length)
    expect(inventory.candidateCounts?.publicConvex).toBeGreaterThanOrEqual(116)
    expect(inventory.candidateCounts?.frozenHttp).toBe(39)
    expect(inventory.candidateCounts?.frozenMcp).toBe(14)
    expect(inventory.candidateCounts?.frozenCli).toBe(12)
  })

  it('discovers generic Convex HTTP handlers and every registered HTTP route', () => {
    const inventory = measuredInventory
    expect(inventory.convexHttpActions.map((row) => row.ref)).toContain(
      'convex/secretLifecycleHttp.ts:secretLifecycleRpc',
    )
    expect(inventory.convexHttpActions.map((row) => row.ref)).toContain(
      'convex/providerConsequenceHttp.ts:providerConsequenceX402Rpc',
    )
    expect(inventory.convexHttpRoutes?.map((row) => row.ref)).toContain(
      'convex_http_route:POST /internal/secret-lifecycle',
    )
    expect(inventory.convexHttpRoutes?.map((row) => row.handlerRef)).toEqual(
      expect.arrayContaining(inventory.convexHttpActions.map((row) => row.ref)),
    )
  })

  it('mechanically accounts for every background and reconciliation reference', () => {
    const inventory = measuredInventory as MeasuredProtectedSurfaceInventory & {
      backgroundDiscovery?: Readonly<{ discoveryKinds: readonly string[]; callSiteCount: number }>
    }
    const discovered = measuredInventory.backgroundFamilies.map((row) => row.ref)
    expect(discovered).toContain('scheduler:convex/chatGenerate.ts:generate')
    expect(discovered).toContain('scheduler:convex/marketRegistryGraduation.ts:sweep')
    expect(discovered).toContain('scheduler:convex/interactiveCredentialLifecycle.ts:expireInteractiveCredential')
    expect(discovered).toContain('run_action:convex/capabilityOperationInvocationWorker.ts:recover')
    expect(discovered).toContain('workpool:convex/capabilityOperationInvocationWorker.ts:run')
    expect(discovered).toContain('continuation:convex/capabilityOperationInvocations.ts:completeWork')
    expect(discovered.some((ref) => ref.startsWith('reconciliation:'))).toBe(true)
    expect(inventory.backgroundDiscovery?.discoveryKinds).toEqual([
      'callback', 'continuation', 'job', 'reconciliation', 'run_action', 'scheduler', 'workpool',
    ])
    expect(inventory.backgroundDiscovery?.callSiteCount).toBeGreaterThanOrEqual(28)
    expect(measuredInventory.crons.every((row) => Array.isArray((row as { callSites?: unknown }).callSites))).toBe(true)
  })

  it('rejects hostile omissions and unchanged-count substitutions in every discovered collection', () => {
    for (const collection of [
      'serverFunctions',
      'publicConvex',
      'convexHttpActions',
      'convexHttpRoutes',
      'crons',
      'backgroundFamilies',
    ] as const) {
      const omitted = structuredClone(measuredInventory) as unknown as Record<string, unknown>
      const omittedRows = omitted[collection] as Array<Record<string, unknown>>
      omittedRows.splice(0, 1)
      expectMeasuredInventoryRejected(omitted)

      const substituted = structuredClone(measuredInventory) as unknown as Record<string, unknown>
      const substitutedRows = substituted[collection] as Array<Record<string, unknown>>
      const first = substitutedRows[0]
      if (first === undefined) throw new Error(`expected a measured ${collection} surface`)
      Object.assign(first, { ref: `${collection}:hostile-same-count-substitution` })
      expectMeasuredInventoryRejected(substituted)
    }
  }, 30_000)

  it('preserves source identity and rejects omissions, duplicates, and unchanged-count replacements', () => {
    expect(() => execFileSync(
      '/Users/joelchan/.nvm/versions/node/v22.22.0/bin/node',
      ['tools/maturity/phase-2-protected-surfaces.mjs', '--require-bound'],
      { cwd: process.cwd(), stdio: 'pipe' },
    )).not.toThrow()
    for (const rows of [
      measuredInventory.serverFunctions,
      measuredInventory.publicConvex,
      measuredInventory.convexHttpActions,
      measuredInventory.convexHttpRoutes,
      measuredInventory.crons,
      measuredInventory.backgroundFamilies,
    ]) {
      expect(rows).toEqual([...rows].sort((left, right) => left.ref.localeCompare(right.ref)))
      expect(new Set(rows.map((row) => row.ref)).size).toBe(rows.length)
      expect(rows.every((row) => /^[a-f0-9]{64}$/.test(row.sha256))).toBe(true)
      expect(rows.every((row) => /^[a-f0-9]{64}$/.test(row.declaration.sha256))).toBe(true)
      expect(rows.every((row) => row.declaration.file.length > 0
        && row.declaration.symbol.length > 0
        && row.declaration.line > 0
        && row.declaration.column > 0)).toBe(true)
    }
    const measuredRefs = [
      ...measuredInventory.serverFunctions,
      ...measuredInventory.publicConvex,
      ...measuredInventory.convexHttpActions,
      ...measuredInventory.convexHttpRoutes,
      ...measuredInventory.crons,
      ...measuredInventory.backgroundFamilies,
    ].map((row) => row.ref).sort()
    expect(Object.keys(classifications.rows).sort()).toEqual(measuredRefs)

    const directory = mkdtempSync(resolve(tmpdir(), 'ae-protected-surfaces-'))
    try {
      for (const [name, mutate] of [
        ['omission', (candidate: Record<string, unknown>) => {
          const rows = candidate.serverFunctions as unknown[]
          rows.pop()
        }],
        ['duplicate', (candidate: Record<string, unknown>) => {
          const rows = candidate.serverFunctions as unknown[]
          rows[1] = structuredClone(rows[0])
        }],
        ['replacement', (candidate: Record<string, unknown>) => {
          const rows = candidate.serverFunctions as Array<Record<string, unknown>>
          rows[0] = { ...rows[0], ref: 'src/replacement.ts:sameCount' }
        }],
      ] as const) {
        const candidate = structuredClone(measuredInventory) as unknown as Record<string, unknown>
        mutate(candidate)
        const output = resolve(directory, `${name}.json`)
        writeFileSync(output, `${JSON.stringify(candidate, null, 2)}\n`)
        expect(() => execFileSync(
          '/Users/joelchan/.nvm/versions/node/v22.22.0/bin/node',
          ['tools/maturity/phase-2-protected-surfaces.mjs', '--check-snapshot', '--output', output],
          { cwd: process.cwd(), stdio: 'pipe' },
        )).toThrow()
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 30_000)

  it('accounts for every frozen HTTP, MCP, CLI, cron, and background contract exactly once', () => {
    expect(refs('http')).toEqual(publicInventory.http.map((row) => row.id).sort())
    expect(refs('mcp')).toEqual(publicInventory.mcp.map((row) => row.actionId).sort())
    expect(refs('cli')).toEqual(publicInventory.cli.map((row) => row.command).sort())
    expect(measuredInventory.frozenContract.httpRefs).toEqual(refs('http'))
    expect(measuredInventory.frozenContract.mcpRefs).toEqual(refs('mcp'))
    expect(measuredInventory.frozenContract.cliRefs).toEqual(refs('cli'))
    expect(measuredInventory.frozenContract.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(verifyProtectedSurfaceManifest()).toMatchObject({
      http: 39,
      mcp: 14,
      cli: 12,
      callback: 2,
      worker: 3,
      job: 9,
      cron: 10,
      continuation: 2,
      reconciliation: 9,
    })
  })

  it('requires exact measured counts with no blocked production surface', () => {
    expect(measuredInventory.actualCounts.serverFunctions).toBe(43)
    expect(measuredInventory.actualCounts.publicConvex).toBe(119)
    expect(measuredInventory.actualCounts.convexHttpActions).toBe(7)
    expect((measuredInventory.actualCounts as Record<string, number>).convexHttpRoutes).toBe(7)
    expect(measuredInventory.actualCounts.crons).toBe(10)
    expect(measuredInventory.actualCounts.backgroundFamilies).toBe(52)
    expect(measuredInventory.actualCounts.frozenHttp).toBe(39)
    expect(measuredInventory.actualCounts.frozenMcp).toBe(14)
    expect(measuredInventory.actualCounts.frozenCli).toBe(12)
    expect(measuredRows().filter((row) => row.status === 'blocked')).toEqual([])
    expect(Object.values(measuredInventory.blockedByKind).every((count) => count === 0)).toBe(true)
  })

  it('proves bound authority through a transitive declaration and call-path evidence chain', () => {
    const authorityRows = measuredRows().filter((row) => row.status === 'bound'
      && row.binding !== 'public_non_consequential'
      && row.binding !== 'narrow_system_non_consequential')
    expect(authorityRows.length).toBeGreaterThan(0)
    for (const row of authorityRows) {
      expect(row.authorityPath?.length).toBeGreaterThanOrEqual(2)
      expect(row.authorityPath?.[0]?.ref).toBe(row.ref)
      expect(row.authorityPath?.at(-1)?.ref).toBe(row.authoritySink)
      expect(row.authorityPath?.slice(1).every((hop) => hop.via === 'call'
        || hop.via === 'function_reference')).toBe(true)
      expect(row.marker).not.toContain('symbol_local')
    }
    const canonicalAgent = measuredInventory.publicConvex
      .find((row) => row.ref === 'convex/authorityBoundary.ts:resolveAgentBinding')
    expect(canonicalAgent).toMatchObject({
      status: 'bound',
      authoritySink: 'convex/authorityBoundary.ts:resolveCanonicalAgentBinding',
    })
    expect(canonicalAgent?.authorityPath?.map((hop) => hop.ref)).toEqual([
      'convex/authorityBoundary.ts:resolveAgentBinding',
      'convex/authorityBoundary.ts:resolveCanonicalAgentBinding',
    ])

    const signedRead = measuredInventory.publicConvex
      .find((row) => row.ref === 'convex/actionInvocationControl.ts:readAttemptSource')
    expect(readFileSync(resolve(process.cwd(), 'convex/actionInvocationControl.ts'), 'utf8'))
      .toContain('requireSourceWrite')
    expect(signedRead).toMatchObject({
      status: 'bound',
      authoritySink: 'convex/sourceWriteAdmission.ts:requireSourceRead',
    })
    expect(signedRead?.authorityPath?.map((hop) => hop.ref)).toEqual([
      'convex/actionInvocationControl.ts:readAttemptSource',
      'convex/actionInvocationControl.ts:requireActionInvocationSourceRead',
      'convex/sourceWriteAdmission.ts:requireSourceRead',
    ])

    const storedFunctionReference = measuredInventory.publicConvex
      .find((row) => row.ref === 'convex/capabilityOperationInvocations.ts:cancelInvocation')
    expect(storedFunctionReference).toMatchObject({
      status: 'bound',
      authoritySink: 'convex/capabilityOperationInvocations.ts:resolveCurrentAgentAuthority',
    })
    expect(storedFunctionReference?.authorityPath?.some((hop) =>
      hop.ref === 'convex/capabilityOperationInvocations.ts:resolveInvocationAgentAuthorityRef'
      && hop.via === 'function_reference')).toBe(true)
  })

  it('validates every exemption against an independent behavior test, never self-attestation', () => {
    const exempt = measuredRows().filter((row) => row.status === 'bound'
      && (row.binding === 'public_non_consequential'
        || row.binding === 'narrow_system_non_consequential'))
    expect(exempt.length).toBeGreaterThan(0)
    for (const row of exempt) {
      expect(row.exemption?.testFile).not.toBe('tests/maturity/phase-2-protected-surfaces.test.ts')
      expect(row.exemption?.testFile).toMatch(/^tests\/.+\.test\.ts$/)
      expect(row.exemption?.testName.length).toBeGreaterThan(0)
      expect(row.exemption?.sourceRef).toBe(row.ref)
      expect(row.exemption?.sha256).toMatch(/^[a-f0-9]{64}$/)
      const proof = readFileSync(resolve(process.cwd(), row.exemption!.testFile), 'utf8')
      expect(proof).toContain(row.exemption!.testName)
      expect(proof).toContain(row.symbol)
    }
    const proofFiles = [...new Set(exempt.map((row) => row.exemption!.testFile))]
    expect(() => execFileSync(
      '/Users/joelchan/.nvm/versions/node/v22.22.0/bin/npm',
      ['exec', '--', 'vitest', 'run', ...proofFiles],
      { cwd: process.cwd(), stdio: 'pipe' },
    )).not.toThrow()

    const candidate = structuredClone(measuredInventory) as CandidateInventory
    const exemptRow = measuredRows().find((row) => row.status === 'bound'
      && row.binding === 'public_non_consequential')
    expect(exemptRow).toBeDefined()
    const target = candidate.publicConvex.find((row) => row.ref === exemptRow!.ref)
      ?? candidate.serverFunctions.find((row) => row.ref === exemptRow!.ref)
    expect(target).toBeDefined()
    Object.assign(target!, { exemption: {
      ...exemptRow!.exemption,
      testFile: 'tests/maturity/phase-2-protected-surfaces.test.ts',
    } })
    expectMeasuredInventoryRejected(candidate)
  }, 30_000)

  it('rejects every unproven surface instead of accepting an open blocked list', () => {
    const blocked = measuredRows().filter((row) => row.status === 'blocked')
    expect(blocked).toEqual([])
    expect(Object.values(measuredInventory.blockedByKind).every((count) => count === 0)).toBe(true)
  })

  it('has no ambient internal, fallback, unknown, or superuser binding', () => {
    const refsAndBindings = [
      ...PROTECTED_SURFACE_MANIFEST.map((row) => ({ ref: row.surfaceRef, binding: row.binding })),
      ...measuredInventory.serverFunctions,
      ...measuredInventory.publicConvex,
      ...measuredInventory.convexHttpActions,
      ...measuredInventory.convexHttpRoutes,
      ...measuredInventory.crons,
      ...measuredInventory.backgroundFamilies,
    ]
    expect(refsAndBindings.some((row) => row.ref.includes('superuser'))).toBe(false)
    expect(refsAndBindings.some((row) => ['fallback', 'unknown', 'internal_superuser'].includes(row.binding))).toBe(false)
    expect(PROTECTED_SURFACE_MANIFEST.filter((row) => row.consequential)
      .every((row) => row.binding !== 'public_non_consequential'
        && row.binding !== 'narrow_system_non_consequential')).toBe(true)
  })

  it('fails closed on omissions, duplicates, implicit exemptions, and unchanged-count replacement', () => {
    expect(() => verifyProtectedSurfaceManifest([])).toThrowError('protected_surface_inventory_invalid')
    expect(() => verifyProtectedSurfaceManifest([
      ...PROTECTED_SURFACE_MANIFEST,
      PROTECTED_SURFACE_MANIFEST[0]!,
    ])).toThrowError('protected_surface_inventory_invalid')
    for (const row of [
      { ...PROTECTED_SURFACE_MANIFEST[0]!, surfaceRef: 'internal:anything' },
      { ...PROTECTED_SURFACE_MANIFEST[0]!, surfaceRef: 'http:superuser' },
      { ...PROTECTED_SURFACE_MANIFEST[0]!, binding: 'future' as never },
      { ...PROTECTED_SURFACE_MANIFEST[0]!, binding: 'public_non_consequential' as const, consequential: true },
      { ...PROTECTED_SURFACE_MANIFEST[0]!, binding: 'narrow_system_non_consequential' as const, consequential: true },
    ]) {
      expect(() => verifyProtectedSurfaceManifest(PROTECTED_SURFACE_MANIFEST.map((candidate, index) =>
        index === 0 ? row : candidate))).toThrowError('protected_surface_binding_invalid')
    }
    expect(() => verifyProtectedSurfaceManifest(PROTECTED_SURFACE_MANIFEST.slice(1)))
      .toThrowError('protected_surface_inventory_invalid')

    const dishonest = structuredClone(measuredInventory) as CandidateInventory
    const target = measuredRows(dishonest).find((row) => row.status === 'bound'
      && row.binding !== 'public_non_consequential'
      && row.binding !== 'narrow_system_non_consequential')
    expect(target).toBeDefined()
    Object.assign(target!, {
      status: 'blocked',
      authorityPath: undefined,
      authoritySink: undefined,
      blocker: { code: 'missing_transitive_authority_path', detail: 'hostile fixture' },
    })
    Object.assign(dishonest.blockedByKind, { [target!.kind]: 1 })
    expectMeasuredInventoryRejected(dishonest)
  })

  it('rejects malformed blocker, status, and transitive-path evidence rows', () => {
    const malformedBlocker = structuredClone(measuredInventory) as CandidateInventory
    const blocked = measuredRows(malformedBlocker).find((row) => row.status === 'bound')
    expect(blocked).toBeDefined()
    Object.assign(blocked!, { status: 'blocked', authorityPath: undefined, authoritySink: undefined, blocker: undefined })
    Object.assign(malformedBlocker.blockedByKind, { [blocked!.kind]: 1 })
    expectMeasuredInventoryRejected(malformedBlocker)

    const malformedStatus = structuredClone(measuredInventory) as CandidateInventory
    const bound = measuredRows(malformedStatus).find((row) => row.status === 'bound')
    expect(bound).toBeDefined()
    Object.assign(bound!, { status: 'future' })
    expectMeasuredInventoryRejected(malformedStatus)

    const malformedPath = structuredClone(measuredInventory) as CandidateInventory
    const authorityBound = measuredRows(malformedPath).find((row) => row.status === 'bound'
      && row.binding !== 'public_non_consequential'
      && row.binding !== 'narrow_system_non_consequential')
    expect(authorityBound).toBeDefined()
    Object.assign(authorityBound!, { authorityPath: [] })
    expectMeasuredInventoryRejected(malformedPath)
  })
})
