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
const measuredInventory = JSON.parse(readFileSync(resolve(contractRoot, 'phase-2-protected-surfaces.json'), 'utf8')) as MeasuredProtectedSurfaceInventory
const classifications = JSON.parse(readFileSync(
  resolve(contractRoot, 'phase-2-protected-surfaces.classifications.json'),
  'utf8',
)) as Readonly<{ rows: Readonly<Record<string, unknown>> }>

function refs(kind: ProtectedSurfaceManifestRow['kind']): readonly string[] {
  return PROTECTED_SURFACE_MANIFEST
    .filter((row) => row.kind === kind)
    .map((row) => row.surfaceRef.slice(kind.length + 1))
    .sort()
}

function measuredRows(inventory: MeasuredProtectedSurfaceInventory = measuredInventory) {
  return [
    ...inventory.serverFunctions,
    ...inventory.publicConvex,
    ...inventory.convexHttpActions,
    ...inventory.crons,
    ...inventory.backgroundFamilies,
  ]
}

describe('Phase 2 generated protected-surface manifest', () => {
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
    expect(measuredInventory.actualCounts.publicConvex).toBe(116)
    expect(measuredInventory.actualCounts.convexHttpActions).toBe(1)
    expect(measuredInventory.actualCounts.crons).toBe(10)
    expect(measuredInventory.actualCounts.backgroundFamilies).toBe(25)
    expect(measuredInventory.actualCounts.frozenHttp).toBe(39)
    expect(measuredInventory.actualCounts.frozenMcp).toBe(14)
    expect(measuredInventory.actualCounts.frozenCli).toBe(12)
    expect(measuredRows().filter((row) => row.status === 'blocked')).toEqual([])
    expect(Object.values(measuredInventory.blockedByKind).every((count) => count === 0)).toBe(true)
    expect(() => verifyProtectedSurfaceManifest(PROTECTED_SURFACE_MANIFEST, measuredInventory)).not.toThrow()
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

    const candidate = structuredClone(measuredInventory) as MeasuredProtectedSurfaceInventory
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
    expect(() => verifyProtectedSurfaceManifest(PROTECTED_SURFACE_MANIFEST, candidate))
      .toThrowError('protected_surface_measured_gate_failed')
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

    const dishonest = structuredClone(measuredInventory) as MeasuredProtectedSurfaceInventory
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
    expect(() => verifyProtectedSurfaceManifest(PROTECTED_SURFACE_MANIFEST, dishonest))
      .toThrowError('protected_surface_measured_gate_failed')
  })

  it('rejects malformed blocker, status, and transitive-path evidence rows', () => {
    const malformedBlocker = structuredClone(measuredInventory) as MeasuredProtectedSurfaceInventory
    const blocked = measuredRows(malformedBlocker).find((row) => row.status === 'bound')
    expect(blocked).toBeDefined()
    Object.assign(blocked!, { status: 'blocked', authorityPath: undefined, authoritySink: undefined, blocker: undefined })
    Object.assign(malformedBlocker.blockedByKind, { [blocked!.kind]: 1 })
    expect(() => verifyProtectedSurfaceManifest(PROTECTED_SURFACE_MANIFEST, malformedBlocker))
      .toThrowError('protected_surface_measured_gate_failed')

    const malformedStatus = structuredClone(measuredInventory) as MeasuredProtectedSurfaceInventory
    const bound = measuredRows(malformedStatus).find((row) => row.status === 'bound')
    expect(bound).toBeDefined()
    Object.assign(bound!, { status: 'future' })
    expect(() => verifyProtectedSurfaceManifest(PROTECTED_SURFACE_MANIFEST, malformedStatus))
      .toThrowError('protected_surface_measured_gate_failed')

    const malformedPath = structuredClone(measuredInventory) as MeasuredProtectedSurfaceInventory
    const authorityBound = measuredRows(malformedPath).find((row) => row.status === 'bound'
      && row.binding !== 'public_non_consequential'
      && row.binding !== 'narrow_system_non_consequential')
    expect(authorityBound).toBeDefined()
    Object.assign(authorityBound!, { authorityPath: [] })
    expect(() => verifyProtectedSurfaceManifest(PROTECTED_SURFACE_MANIFEST, malformedPath))
      .toThrowError('protected_surface_measured_gate_failed')
  })
})
