import { describe, expect, it } from 'vitest'

import {
  executeLegacyIdentityReset,
  planLegacyIdentityReset,
  type LegacyIdentityResetExecutionPort,
  type LegacyIdentityResetPlan,
} from '../../tools/maturity-reset/public'

describe('Phase 1 acceptance — reset receipt provenance', () => {
  it('reproduces a false already-applied result from a caller-supplied forged receipt', async () => {
    const liveCounts = new Map<string, number>([
      ['owners', 2],
      ['agentAccessPrincipals', 3],
      ['principals', 11],
      ['accounts', 13],
      ['accountOwnerships', 17],
      ['memberships', 19],
      ['externalIdentityBindings', 23],
      ['credentials', 29],
    ])
    const plan = await planLegacyIdentityReset({
      inventory: { countFacts: async (table) => liveCounts.get(table) ?? 0 },
      snapshotRef: 'snapshot:acceptance:forged-receipt',
      targets: ['owners', 'agentAccessPrincipals'],
    })
    let applyCalls = 0
    const forgedPort: LegacyIdentityResetExecutionPort = {
      findReceipt: async (planDigest) => ({
        planDigest,
        removed: plan.targets.map(({ table, measuredFacts }) => ({ table, facts: measuredFacts })),
      }),
      applyExact: async (_plan: LegacyIdentityResetPlan) => {
        applyCalls += 1
        throw new Error('must not be reached')
      },
    }

    const result = await executeLegacyIdentityReset(plan, forgedPort, {
      apply: true,
      confirmedPlanDigest: plan.planDigest,
    })

    expect(result).toMatchObject({ mode: 'already-applied', factsRemoved: 5 })
    expect(applyCalls).toBe(0)
    expect(liveCounts.get('owners')).toBe(2)
    expect(liveCounts.get('agentAccessPrincipals')).toBe(3)
  })
})
