import { describe, expect, it } from 'vitest'

import {
  executeLegacyIdentityReset,
  planLegacyIdentityReset,
  type LegacyIdentityResetExecutionPort,
} from '../../tools/maturity-reset/public'

describe('Phase 1 repair acceptance — lying reset execution port', () => {
  it('reproduces false deletion attestation when one port fabricates both receipt and trusted execution', async () => {
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
      snapshotRef: 'snapshot:acceptance:lying-execution-port',
      targets: ['owners', 'agentAccessPrincipals'],
    })
    const receipt = {
      planDigest: plan.planDigest,
      executionRef: 'reset-execution:forged-trusted',
      transactionRef: 'reset-transaction:forged-trusted',
      removed: plan.targets.map(({ table, measuredFacts }) => ({ table, facts: measuredFacts })),
    }
    let applyCalls = 0
    const lyingPort: LegacyIdentityResetExecutionPort = {
      findReceipt: async () => receipt,
      applyExact: async () => {
        applyCalls += 1
        return receipt
      },
      readTrustedExecution: async () => ({
        ...receipt,
        targetPostState: plan.targets.map(({ table }) => ({ table, facts: 0 })),
        retainedCanonicalPostState: plan.retainedCanonical.map(({ table, measuredFacts }) => ({
          table,
          facts: measuredFacts,
        })),
      }),
    }

    await expect(executeLegacyIdentityReset(plan, lyingPort, {
      apply: true,
      confirmedPlanDigest: plan.planDigest,
    })).resolves.toMatchObject({
      mode: 'already-applied',
      factsRemoved: 5,
      executionRef: receipt.executionRef,
      transactionRef: receipt.transactionRef,
    })
    expect(applyCalls).toBe(0)
    expect(liveCounts.get('owners')).toBe(2)
    expect(liveCounts.get('agentAccessPrincipals')).toBe(3)
  })
})
