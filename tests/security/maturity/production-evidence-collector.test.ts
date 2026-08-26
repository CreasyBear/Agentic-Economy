import { describe, expect, it } from 'vitest'

import {
  collectProductionEvidence,
  type ProductionEvidenceRequest,
  type ProductionEvidenceSinkCollectors,
} from '../../../src/modules/authority/recovery/public'
import { accountRef } from '../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../src/modules/principal-account/principal/public'
import type {
  MeasuredProtectedSurfaceInventory,
  MeasuredProtectedSurfaceRow,
} from '../../../src/lib/server/authority-boundary/protected-surface-manifest'

const ACCOUNT = accountRef('acc_00000000000040008000000000000041')
const OTHER = accountRef('acc_00000000000040008000000000000042')
const actors = Object.freeze({
  owner: principalRef('prn_00000000000040008000000000000041'),
  member: principalRef('prn_00000000000040008000000000000042'),
  stranger: principalRef('prn_00000000000040008000000000000043'),
  workload: principalRef('prn_00000000000040008000000000000044'),
})
const HASH = 'a'.repeat(64)

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
  return Object.freeze({
    format: 'phase-2-protected-surfaces:v2',
    expectedCounts: Object.freeze({
      serverFunctions: 43, publicConvex: 116, convexHttpActions: 1, crons: 10,
      backgroundFamilies: 25, frozenHttp: 39, frozenMcp: 14, frozenCli: 12,
    }),
    actualCounts: Object.freeze({
      serverFunctions: 43, publicConvex: 116, convexHttpActions: 1, crons: 10,
      backgroundFamilies: 25, frozenHttp: 39, frozenMcp: 14, frozenCli: 12,
    }),
    frozenContract: Object.freeze({
      sourceFile: '.planning/maturity-execution/contracts/public-surface-inventory.json',
      sha256: HASH,
      httpRefs: Object.freeze(Array.from({ length: 39 }, (_, index) => `http:${index}`)),
      mcpRefs: Object.freeze(Array.from({ length: 14 }, (_, index) => `mcp:${index}`)),
      cliRefs: Object.freeze(Array.from({ length: 12 }, (_, index) => `cli:${index}`)),
    }),
    serverFunctions: rows('server_function', 43),
    publicConvex: rows('convex_public', 116, true),
    convexHttpActions: rows('http', 1),
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

function evidenceRequest(candidate = inventory(), collectors = sinks()): ProductionEvidenceRequest {
  return {
    measuredInventory: candidate,
    resolveSurface: async (measured) => ({
      surfaceRef: measured.ref,
      owningAccountRef: ACCOUNT,
      resourceRef: `surface:${measured.ref}`,
    }),
    actors,
    wrongAccountRef: OTHER,
    currentGeneration: 4,
    evaluate: async (probe) => probe.protection === 'tested_public_exemption'
      ? { kind: 'allowed' }
      : probe.caseKind === 'owner' || probe.caseKind === 'member' || probe.caseKind === 'workload'
        ? { kind: 'allowed' }
        : { kind: 'denied', reason: 'canonical_authority_denied' },
    canary: new TextEncoder().encode('production-canary'),
    sinkCollectors: collectors,
  }
}

async function collect(candidate = inventory(), collectors = sinks()) {
  return await collectProductionEvidence(evidenceRequest(candidate, collectors))
}

describe('P2-05 production evidence collector', () => {
  it('accounts for all 195 exact measured IDs and generates 1,365 isolation decisions from real sink classes', async () => {
    const proof = await collect()
    expect(proof.measuredSurfaceCount).toBe(195)
    expect(proof.isolation.surfaceCount).toBe(195)
    expect(proof.isolation.caseCount).toBe(1_365)
    expect(new Set(proof.isolation.rows.map((value) => value.surfaceRef))).toHaveLength(195)
    expect(proof.isolation.rows.filter((value) => value.protection === 'tested_public_exemption'))
      .toHaveLength(7)
    expect(proof.isolation.rows.find((value) => value.protection === 'tested_public_exemption'
      && value.caseKind === 'missing_workload')?.decision).toEqual({ kind: 'allowed' })
    expect(proof.canary.checkedSinks).toHaveLength(6)
    expect(proof.sinkSourceRefs).toEqual([
      'convex:export', 'logger:capture', 'errors:capture',
      'audit:readback', 'runtime:environment', 'test:snapshot',
    ])
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

    const unproved = structuredClone(inventory())
    delete (unproved.publicConvex[0] as { exemption?: unknown }).exemption
    await expect(collect(unproved)).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    await expect(collect(inventory(), { ...sinks(), log: async () => ({ sourceRef: '', textFragments: ['clean'] }) }))
      .rejects.toMatchObject({ code: 'production_evidence_sink_invalid' })

    const badProtected = structuredClone(inventory()) as unknown as {
      serverFunctions: MeasuredProtectedSurfaceRow[]
    } & MeasuredProtectedSurfaceInventory
    badProtected.serverFunctions[0] = { ...badProtected.serverFunctions[0]!, authorityPath: [] }
    await expect(collect(badProtected)).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

    await expect(collectProductionEvidence({
      ...evidenceRequest(),
      resolveSurface: async (measured) => ({
        surfaceRef: `${measured.ref}:wrong`, owningAccountRef: ACCOUNT, resourceRef: 'surface:wrong',
      }),
    })).rejects.toMatchObject({ code: 'production_evidence_inventory_invalid' })

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
