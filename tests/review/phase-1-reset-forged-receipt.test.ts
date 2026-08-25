import { describe, expect, it } from 'vitest'

import {
  executeLegacyIdentityReset,
  planLegacyIdentityReset,
  type LegacyIdentityResetExecutionPort,
  type LegacyIdentityResetPlan,
} from '../../tools/maturity-reset/public'

describe('Phase 1 acceptance — reset receipt provenance', () => {
  it('rejects a shape-valid receipt with no matching trusted execution', async () => {
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
    const forgedPort = {
      findReceipt: async (planDigest: string) => ({
        planDigest,
        executionRef: 'reset-execution:forged',
        transactionRef: 'reset-transaction:forged',
        removed: plan.targets.map(({ table, measuredFacts }) => ({ table, facts: measuredFacts })),
      }),
      applyExact: async (_plan: LegacyIdentityResetPlan) => {
        applyCalls += 1
        throw new Error('must not be reached')
      },
    } as unknown as LegacyIdentityResetExecutionPort

    await expect(executeLegacyIdentityReset(plan, forgedPort, {
      apply: true,
      confirmedPlanDigest: plan.planDigest,
    })).rejects.toMatchObject({
      name: 'LegacyIdentityResetError',
      code: 'reset_receipt_untrusted',
      message: 'reset_receipt_untrusted',
    })
    expect(applyCalls).toBe(0)
    expect(liveCounts.get('owners')).toBe(2)
    expect(liveCounts.get('agentAccessPrincipals')).toBe(3)
  })
})
