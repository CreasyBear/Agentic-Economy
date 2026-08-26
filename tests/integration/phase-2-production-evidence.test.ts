import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectProductionEvidence,
  evaluateCanonicalIsolationProbe,
  type ProductionEvidenceSinkCollectors,
} from '../../src/modules/authority/recovery/public'
import { accountRef, principalRef } from '../../src/modules/principal-account/public'
import type { MeasuredProtectedSurfaceInventory } from '../../src/lib/server/authority-boundary/protected-surface-manifest'

const CONTRACT = '.planning/maturity-execution/contracts/phase-2-protected-surfaces.json'
const ACCOUNT = accountRef('acc_00000000000040008000000000000061')
const OTHER_ACCOUNT = accountRef('acc_00000000000040008000000000000062')
const actors = Object.freeze({
  owner: principalRef('prn_00000000000040008000000000000061'),
  member: principalRef('prn_00000000000040008000000000000062'),
  stranger: principalRef('prn_00000000000040008000000000000063'),
  workload: principalRef('prn_00000000000040008000000000000064'),
})

function text(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function sinkCollectors(): ProductionEvidenceSinkCollectors {
  return Object.freeze({
    convex_row: async () => ({
      sourceRef: 'src/modules/secrets/internal/convex-schema.ts:secretLifecycleJournal',
      textFragments: [text('src/modules/secrets/internal/convex-schema.ts')],
    }),
    log: async () => ({
      sourceRef: 'src/lib/observability/client-error.ts:sanitized-client-error',
      textFragments: [text('src/lib/observability/client-error.ts')],
    }),
    error: async () => ({
      sourceRef: 'src/lib/errors.ts:public-error-contract',
      textFragments: [text('src/lib/errors.ts')],
    }),
    audit: async () => ({
      sourceRef: 'src/modules/observability/internal/audit.ts:audit-event',
      textFragments: [text('src/modules/observability/internal/audit.ts')],
    }),
    environment: async () => ({
      sourceRef: 'src/lib/deployment/manifest.ts:declared-environment',
      textFragments: [text('src/lib/deployment/manifest.ts')],
    }),
    snapshot: async () => ({
      sourceRef: `${CONTRACT}:measured-inventory`,
      byteFragments: [readFileSync(resolve(process.cwd(), CONTRACT))],
    }),
  })
}

describe('Phase 2 exact production evidence composition', () => {
  it('drives all 195 measured source identities through 1,365 canonical isolation cases and six concrete sink collectors', async () => {
    const measuredInventory = JSON.parse(text(CONTRACT)) as MeasuredProtectedSurfaceInventory
    const canary = new TextEncoder().encode('ae-secret-canary-production-proof')
    const proof = await collectProductionEvidence({
      measuredInventory,
      resolveSurface: async (row) => Object.freeze({
        surfaceRef: row.ref,
        owningAccountRef: ACCOUNT,
        resourceRef: `measured-surface:${row.ref}`,
      }),
      actors,
      wrongAccountRef: OTHER_ACCOUNT,
      currentGeneration: 17,
      evaluate: async (probe) => evaluateCanonicalIsolationProbe(probe, actors),
      canary,
      sinkCollectors: sinkCollectors(),
    })

    expect(proof.measuredSurfaceCount).toBe(195)
    expect(proof.measuredSurfaceRefs).toHaveLength(195)
    expect(new Set(proof.measuredSurfaceRefs).size).toBe(195)
    expect(proof.isolation).toMatchObject({ surfaceCount: 195, caseCount: 1_365 })
    expect(proof.isolation.rows).toHaveLength(1_365)
    expect(new Set(proof.isolation.rows.map(({ surfaceRef }) => surfaceRef)).size).toBe(195)
    const protectedRows = proof.isolation.rows.filter(({ protection }) => protection === 'protected')
    expect(protectedRows.filter(({ caseKind, decision }) =>
      ['missing_workload', 'stranger', 'wrong_account', 'stale_generation'].includes(caseKind)
      && decision.kind === 'denied')).toHaveLength(protectedRows.length * 4 / 7)
    expect(protectedRows.some(({ caseKind, decision }) =>
      caseKind === 'missing_workload' && decision.kind === 'allowed')).toBe(false)
    expect(proof.sinkSourceRefs).toEqual([
      'src/modules/secrets/internal/convex-schema.ts:secretLifecycleJournal',
      'src/lib/observability/client-error.ts:sanitized-client-error',
      'src/lib/errors.ts:public-error-contract',
      'src/modules/observability/internal/audit.ts:audit-event',
      'src/lib/deployment/manifest.ts:declared-environment',
      `${CONTRACT}:measured-inventory`,
    ])
    expect(proof.canary.checkedSinks).toEqual([
      'convex_row', 'log', 'error', 'audit', 'environment', 'snapshot',
    ])
  })
})
