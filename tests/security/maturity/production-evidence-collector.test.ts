import { describe, expect, it } from 'vitest'

import {
  collectProductionEvidence,
  type ProductionEvidenceRequest,
  type ProductionEvidenceSinkCollectors,
} from '../../../src/modules/authority/recovery/public'
import type {
  MeasuredProtectedSurfaceInventory,
  MeasuredProtectedSurfaceRow,
} from '../../../src/lib/server/authority-boundary/protected-surface-manifest'

const HASH = 'a'.repeat(64)
const CASE_LABELS = ['owner', 'member', 'workload', 'missing_workload', 'stranger', 'wrong_account', 'stale_generation'] as const

function row(kind: MeasuredProtectedSurfaceRow['kind'], index: number, exempt = false): MeasuredProtectedSurfaceRow {
  const ref = `measured/${kind}/${index}.ts:surface${index}`
  return Object.freeze({
    ref,
    kind,
    file: `measured/${kind}/${index}.ts`,
    symbol: `surface${index}`,
    registrar: 'fixture',
    binding: exempt ? 'public_non_consequential' : 'workload_account',
    consequential: !exempt,
    status: 'bound',
    marker: exempt ? 'tested_public_exemption' : 'transitive_authority_path',
    sha256: HASH,
    declaration: Object.freeze({
      file: `measured/${kind}/${index}.ts`, symbol: `surface${index}`,
      line: 1, column: 1, sha256: HASH,
    }),
    ...(exempt
      ? { exemption: Object.freeze({
          testFile: 'tests/unit/public-surface.test.ts',
          testName: 'permits anonymous nonconsequential read',
          sourceRef: ref,
          sha256: HASH,
        }) }
      : {
          authoritySink: 'convex/authorityBoundary.ts:admitConsequence',
          authorityPath: Object.freeze([
            Object.freeze({ ref, file: `measured/${kind}/${index}.ts`, line: 1, column: 1, via: 'declaration' as const }),
            Object.freeze({ ref: 'convex/authorityBoundary.ts:admitConsequence', file: 'convex/authorityBoundary.ts', line: 1, column: 1, via: 'call' as const }),
          ]),
        }),
  })
}

function rows(kind: MeasuredProtectedSurfaceRow['kind'], count: number, firstExempt = false) {
  return Object.freeze(Array.from({ length: count }, (_, index) => row(kind, index, firstExempt && index === 0)))
}

function inventory(): MeasuredProtectedSurfaceInventory {
  const baselineCounts = Object.freeze({
    serverFunctions: 47, publicConvex: 127, convexHttpActions: 7, crons: 10,
    backgroundFamilies: 25, frozenHttp: 56, frozenMcp: 26, frozenCli: 15,
  })
  const candidateCounts = Object.freeze({ ...baselineCounts, convexHttpRoutes: 0 })
  return Object.freeze({
    format: 'phase-2-protected-surfaces:v2',
    expectedCounts: baselineCounts,
    baselineCounts,
    candidateCounts,
    actualCounts: candidateCounts,
    frozenContract: Object.freeze({
      sourceFile: '.planning/maturity-execution/contracts/public-surface-inventory.json',
      sha256: HASH,
      httpRefs: Object.freeze(Array.from({ length: 56 }, (_, index) => `http:${index}`)),
      mcpRefs: Object.freeze(Array.from({ length: 26 }, (_, index) => `mcp:${index}`)),
      cliRefs: Object.freeze(Array.from({ length: 15 }, (_, index) => `cli:${index}`)),
    }),
    serverFunctions: rows('server_function', 47),
    publicConvex: rows('convex_public', 127, true),
    convexHttpActions: rows('http', 7),
    convexHttpRoutes: Object.freeze([]),
    crons: rows('cron', 10),
    backgroundFamilies: rows('job', 25),
    blockedByKind: Object.freeze({ server_function: 0, convex_public: 0, http: 0, cron: 0, job: 0 }),
  })
}

function sinks(): ProductionEvidenceSinkCollectors {
  return Object.freeze({
    convex_row: async () => ({ sourceRef: 'convex:export', textFragments: ['opaque-ref'] }),
    log: async () => ({ sourceRef: 'logger:capture', textFragments: ['completed'] }),
    error: async () => ({ sourceRef: 'errors:capture', textFragments: ['unavailable'] }),
    audit: async () => ({ sourceRef: 'audit:readback', textFragments: ['dual-attributed'] }),
    environment: async () => ({ sourceRef: 'runtime:environment', textFragments: ['PROJECT_ID'] }),
    snapshot: async () => ({ sourceRef: 'test:snapshot', byteFragments: [Uint8Array.from([1, 2, 3])] }),
  })
}

function runtimeHandlerTests(candidate: MeasuredProtectedSurfaceInventory): ProductionEvidenceRequest['runtimeHandlerTests'] {
  const protectedRows = [
    ...candidate.serverFunctions,
    ...candidate.publicConvex,
    ...candidate.convexHttpActions,
    ...candidate.convexHttpRoutes,
    ...candidate.crons,
    ...candidate.backgroundFamilies,
  ].filter((measured) => measured.consequential)
  const rows = Object.fromEntries([...new Set(protectedRows.map((measured) => measured.authoritySink as string))]
    .map((authoritySink, index) => {
      const measured = protectedRows.find((candidateRow) => candidateRow.authoritySink === authoritySink)
      if (measured === undefined) throw new Error('test_runtime_sink_missing')
      return [authoritySink, Object.freeze({
        status: 'covered' as const,
        surfaceRef: measured.ref,
        testFile: `tests/unit/runtime-handler-${index}.test.ts`,
        testName: `executes runtime handler ${index}`,
        sha256: HASH,
        caseLabels: CASE_LABELS,
      })]
    }))
  return Object.freeze({
    format: 'phase-2-authority-sink-runtime-tests:v2',
    inventorySha256: HASH,
    rows: Object.freeze(rows),
  })
}

function surfaceAuthorityMap(candidate: MeasuredProtectedSurfaceInventory): ProductionEvidenceRequest['surfaceAuthorityMap'] {
  const registry = runtimeHandlerTests(candidate)
  const measuredRows = [
    ...candidate.serverFunctions, ...candidate.publicConvex, ...candidate.convexHttpActions,
    ...candidate.convexHttpRoutes, ...candidate.crons, ...candidate.backgroundFamilies,
  ]
  const protectedCount = measuredRows.filter((measured) => measured.consequential).length
  return Object.freeze({
    format: 'phase-2-surface-authority-map:v1',
    inventorySha256: HASH,
    total: measuredRows.length,
    protected: protectedCount,
    exemptions: measuredRows.length - protectedCount,
    proved: protectedCount,
    red: 0,
    rows: Object.freeze(measuredRows.map((measured) => measured.consequential
      ? Object.freeze({
          surfaceRef: measured.ref,
          runtimeHandlerRef: `${measured.file}:${measured.symbol}`,
          authoritySink: measured.authoritySink as string,
          dominance: Object.freeze({ status: 'proved' as const, sha256: HASH }),
          runtimeIsolation: (() => {
            const test = registry.rows[measured.authoritySink as string]
            if (test?.status !== 'covered') throw new Error('test_runtime_sink_missing')
            return Object.freeze({
              testFile: test.testFile, testName: test.testName,
              testSha256: test.sha256, caseLabels: CASE_LABELS,
            })
          })(),
        })
      : Object.freeze({
          surfaceRef: measured.ref,
          runtimeHandlerRef: `${measured.file}:${measured.symbol}`,
          status: 'tested_exemption' as const,
          testFile: measured.exemption?.testFile ?? '',
          testName: measured.exemption?.testName ?? '',
        }))),
  })
}

function evidenceRequest(candidate = inventory(), collectors = sinks()): ProductionEvidenceRequest {
  return {
    measuredInventory: candidate,
    measuredInventorySha256: HASH,
    runtimeHandlerTests: runtimeHandlerTests(candidate),
    surfaceAuthorityMap: surfaceAuthorityMap(candidate),
    canary: new TextEncoder().encode('production-canary'),
    sinkCollectors: collectors,
  }
}

async function collect(candidate = inventory(), collectors = sinks()) {
  return await collectProductionEvidence(evidenceRequest(candidate, collectors))
}

function candidateSurfaceCount(candidate: MeasuredProtectedSurfaceInventory): number {
  return candidate.serverFunctions.length
    + candidate.publicConvex.length
    + candidate.convexHttpActions.length
    + candidate.convexHttpRoutes.length
    + candidate.crons.length
    + candidate.backgroundFamilies.length
}

describe('P2-05 production evidence collector', () => {
  it('accounts for every exact measured ID through the measured runtime-isolation map', async () => {
    const proof = await collect()
    const candidateCount = candidateSurfaceCount(inventory())
    expect(proof.baselineSurfaceCount).toBe(216)
    expect(proof.measuredSurfaceCount).toBe(candidateCount)
    expect(proof.surfaceRuntimeIsolationIndex).toMatchObject({
      surfaceCount: candidateCount,
      protectedSurfaceCount: candidateCount - 1,
      testedExemptionCount: 1,
      caseCount: (candidateCount - 1) * 7,
    })
    expect(new Set(proof.surfaceRuntimeIsolationIndex.surfaceRefs)).toHaveLength(candidateCount)
    expect(proof.runtimeHandlerTestIndex).toMatchObject({
      kind: 'generated_authority_composition_test_index', sinkCount: 1, caseCount: 7, inventorySha256: HASH,
    })
    expect(proof.canary.checkedSinks).toHaveLength(6)
    expect(proof.sinkSourceRefs).toEqual([
      'convex:export', 'logger:capture', 'errors:capture',
      'audit:readback', 'runtime:environment', 'test:snapshot',
    ])
  })

  it('keeps the frozen baseline separate when the measured candidate inventory expands', async () => {
    const expanded = structuredClone(inventory()) as unknown as {
      publicConvex: MeasuredProtectedSurfaceRow[]
      convexHttpRoutes: MeasuredProtectedSurfaceRow[]
      candidateCounts: MeasuredProtectedSurfaceInventory['candidateCounts']
      actualCounts: MeasuredProtectedSurfaceInventory['actualCounts']
    } & MeasuredProtectedSurfaceInventory
    expanded.publicConvex.push(
      row('mcp', 116),
      row('cli', 117),
      row('callback', 118),
      row('worker', 119),
      row('reconciliation', 120),
      row('continuation', 121),
    )
    expanded.convexHttpRoutes = [row('http', 122)]
    expanded.candidateCounts = { ...expanded.candidateCounts, publicConvex: 133, convexHttpRoutes: 1 }
    expanded.actualCounts = { ...expanded.actualCounts, publicConvex: 133, convexHttpRoutes: 1 }

    const proof = await collect(expanded)

    expect(proof.baselineCounts).toEqual(inventory().expectedCounts)
    expect(proof.baselineSurfaceCount).toBe(216)
    expect(proof.candidateCounts.publicConvex).toBe(133)
    expect(proof.candidateCounts.convexHttpRoutes).toBe(1)
    expect(proof.measuredSurfaceCount).toBe(223)
    expect(proof.surfaceRuntimeIsolationIndex.caseCount).toBe(222 * 7)
  })

  it('rejects omissions, duplicates, unproved exemptions and synthetic sink rows', async () => {
    const omitted = structuredClone(inventory()) as unknown as {
      serverFunctions: MeasuredProtectedSurfaceRow[]
    } & MeasuredProtectedSurfaceInventory
    omitted.serverFunctions.pop()
    await expect(collect(omitted)).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    const duplicate = structuredClone(inventory()) as unknown as {
      publicConvex: MeasuredProtectedSurfaceRow[]
    } & MeasuredProtectedSurfaceInventory
    duplicate.publicConvex[1] = duplicate.publicConvex[0]!
    await expect(collect(duplicate)).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    const routeCountMismatch = structuredClone(inventory()) as unknown as {
      candidateCounts: MeasuredProtectedSurfaceInventory['candidateCounts']
      actualCounts: MeasuredProtectedSurfaceInventory['actualCounts']
    } & MeasuredProtectedSurfaceInventory
    routeCountMismatch.candidateCounts = { ...routeCountMismatch.candidateCounts, convexHttpRoutes: 2 }
    routeCountMismatch.actualCounts = { ...routeCountMismatch.actualCounts, convexHttpRoutes: 2 }
    await expect(collect(routeCountMismatch)).rejects.toMatchObject({
      code: 'production_evidence_inventory_invalid',
    })

    const unproved = structuredClone(inventory())
    delete (unproved.publicConvex[0] as { exemption?: unknown }).exemption
    await expect(collect(unproved)).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    await expect(collect(inventory(), { ...sinks(), log: async () => ({ sourceRef: '', textFragments: ['clean'] }) }))
      .rejects.toMatchObject({ code: 'production_evidence_sink_invalid' })
    await expect(collect(inventory(), { ...sinks(), log: async () => ({ sourceRef: 'logger:empty' }) }))
      .rejects.toMatchObject({ code: 'production_evidence_sink_invalid' })

    const badProtected = structuredClone(inventory()) as unknown as {
      serverFunctions: MeasuredProtectedSurfaceRow[]
    } & MeasuredProtectedSurfaceInventory
    badProtected.serverFunctions[0] = { ...badProtected.serverFunctions[0]!, authorityPath: [] }
    await expect(collect(badProtected)).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    const blocked = structuredClone(inventory()) as unknown as {
      serverFunctions: MeasuredProtectedSurfaceRow[]
    } & MeasuredProtectedSurfaceInventory
    blocked.serverFunctions[0] = { ...blocked.serverFunctions[0]!, status: 'blocked' }
    await expect(collect(blocked)).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    const registry = runtimeHandlerTests(inventory())
    const [authoritySink] = Object.keys(registry.rows)
    if (authoritySink === undefined) throw new Error('test_runtime_sink_missing')
    const redRegistry = {
      ...registry,
      rows: { ...registry.rows, [authoritySink]: { status: 'red' as const, reason: 'runtime_handler_test_missing' } },
    }
    await expect(collectProductionEvidence({
      ...evidenceRequest(), runtimeHandlerTests: redRegistry,
    })).rejects.toMatchObject({ code: 'production_evidence_runtime_handler_red' })

    const wrongInventoryDigest = { ...registry, inventorySha256: 'b'.repeat(64) }
    await expect(collectProductionEvidence({
      ...evidenceRequest(), runtimeHandlerTests: wrongInventoryDigest,
    })).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    const { [authoritySink]: _omitted, ...remainingRuntimeSinks } = registry.rows
    const missingRuntimeSink = { ...registry, rows: remainingRuntimeSinks }
    await expect(collectProductionEvidence({
      ...evidenceRequest(), runtimeHandlerTests: missingRuntimeSink,
    })).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    const covered = registry.rows[authoritySink]
    if (covered?.status !== 'covered') throw new Error('test_runtime_sink_missing')
    const wrongRuntimeSurface = {
      ...registry,
      rows: { ...registry.rows, [authoritySink]: { ...covered, surfaceRef: 'surface:wrong' } },
    }
    await expect(collectProductionEvidence({
      ...evidenceRequest(), runtimeHandlerTests: wrongRuntimeSurface,
    })).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    const twoSinks = structuredClone(inventory()) as unknown as {
      serverFunctions: MeasuredProtectedSurfaceRow[]
    } & MeasuredProtectedSurfaceInventory
    const secondSink = 'convex/secondAuthoritySink.ts:admit'
    const original = twoSinks.serverFunctions[0]!
    twoSinks.serverFunctions[0] = {
      ...original,
      authoritySink: secondSink,
      authorityPath: Object.freeze([
        original.authorityPath![0]!,
        Object.freeze({
          ref: secondSink, file: 'convex/secondAuthoritySink.ts', line: 1, column: 1, via: 'call' as const,
        }),
      ]),
    }
    const twoSinkRegistry = runtimeHandlerTests(twoSinks)
    const malformedCases = {
      ...twoSinkRegistry,
      rows: Object.fromEntries(Object.entries(twoSinkRegistry.rows).map(([sink, row]) => [
        sink,
        row.status === 'red' ? row : { ...row, caseLabels: CASE_LABELS.slice(0, 6) },
      ])),
    }
    await expect(collectProductionEvidence({
      ...evidenceRequest(twoSinks), runtimeHandlerTests: malformedCases,
    })).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    const wrongMap = structuredClone(surfaceAuthorityMap(inventory())) as unknown as {
      rows: Array<{ runtimeHandlerRef: string }>
    } & ProductionEvidenceRequest['surfaceAuthorityMap']
    wrongMap.rows[0]!.runtimeHandlerRef = 'surface:wrong'
    await expect(collectProductionEvidence({
      ...evidenceRequest(),
      surfaceAuthorityMap: wrongMap,
    })).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    const canonicalMap = surfaceAuthorityMap(inventory())
    const malformedMapHeaders: ProductionEvidenceRequest['surfaceAuthorityMap'][] = [
      { ...canonicalMap, format: 'future-format' as never },
      { ...canonicalMap, inventorySha256: 'b'.repeat(64) },
      { ...canonicalMap, total: canonicalMap.total + 1 },
      { ...canonicalMap, exemptions: canonicalMap.exemptions + 1 },
      { ...canonicalMap, proved: canonicalMap.proved - 1 },
      { ...canonicalMap, red: 1 },
      { ...canonicalMap, rows: canonicalMap.rows.slice(1) },
      { ...canonicalMap, rows: [...canonicalMap.rows].reverse() },
    ]
    for (const surfaceAuthorityMap of malformedMapHeaders) {
      await expect(collectProductionEvidence({
        ...evidenceRequest(),
        surfaceAuthorityMap,
      })).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })
    }

    const protectedRowIndex = canonicalMap.rows.findIndex((mapRow) => mapRow.authoritySink !== undefined)
    const exemptRowIndex = canonicalMap.rows.findIndex((mapRow) => mapRow.status === 'tested_exemption')
    const malformedProtectedRows = [
      { authoritySink: 'authority:wrong' },
      { dominance: { status: 'red' as const } },
      { dominance: { status: 'proved' as const } },
      { dominance: { status: 'proved' as const, sha256: 'bad' } },
      { runtimeIsolation: undefined },
      { runtimeIsolation: { ...canonicalMap.rows[protectedRowIndex]!.runtimeIsolation!, testFile: 'tests/unit/wrong.test.ts' } },
      { runtimeIsolation: { ...canonicalMap.rows[protectedRowIndex]!.runtimeIsolation!, testName: 'wrong test' } },
      { runtimeIsolation: { ...canonicalMap.rows[protectedRowIndex]!.runtimeIsolation!, testSha256: 'b'.repeat(64) } },
      { runtimeIsolation: { ...canonicalMap.rows[protectedRowIndex]!.runtimeIsolation!, caseLabels: CASE_LABELS.slice(0, 6) } },
    ]
    for (const replacement of malformedProtectedRows) {
      const map = structuredClone(canonicalMap) as unknown as { rows: Array<Record<string, unknown>> }
      map.rows[protectedRowIndex] = { ...map.rows[protectedRowIndex]!, ...replacement }
      await expect(collectProductionEvidence({
        ...evidenceRequest(),
        surfaceAuthorityMap: map as unknown as ProductionEvidenceRequest['surfaceAuthorityMap'],
      })).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })
    }

    const malformedExemptRows = [
      { status: undefined },
      { testFile: 'tests/unit/wrong.test.ts' },
      { testName: 'wrong test' },
      { runtimeIsolation: canonicalMap.rows[protectedRowIndex]!.runtimeIsolation },
    ]
    for (const replacement of malformedExemptRows) {
      const map = structuredClone(canonicalMap) as unknown as { rows: Array<Record<string, unknown>> }
      map.rows[exemptRowIndex] = { ...map.rows[exemptRowIndex]!, ...replacement }
      await expect(collectProductionEvidence({
        ...evidenceRequest(),
        surfaceAuthorityMap: map as unknown as ProductionEvidenceRequest['surfaceAuthorityMap'],
      })).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })
    }

    const missingSink = { ...sinks() } as unknown as Record<string, unknown>
    delete missingSink.log
    await expect(collect(inventory(), missingSink as ProductionEvidenceSinkCollectors))
      .rejects.toMatchObject({ code: 'production_evidence_sink_invalid' })
    await expect(collect(inventory(), { ...sinks(), log: async () => { throw new Error('collector_detail') } }))
      .rejects.toMatchObject({ code: 'production_evidence_sink_invalid' })
    await expect(collect(inventory(), {
      ...sinks(), log: async () => ({ sourceRef: 'convex:export', textFragments: ['clean'] }),
    })).rejects.toMatchObject({ code: 'production_evidence_sink_invalid' })
  })
})
