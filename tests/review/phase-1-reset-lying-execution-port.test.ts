import { describe, expect, it } from 'vitest'

import {
  executeLegacyIdentityReset,
  planLegacyIdentityReset,
  type LegacyIdentityResetActionContext,
  type LegacyIdentityResetExecutionPort,
} from '../../tools/maturity-reset/public'

describe('Phase 1 repair acceptance — lying reset execution port', () => {
  it('rejects one capability object used to fabricate mutation, evidence and inventory', async () => {
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
    const context: LegacyIdentityResetActionContext = {
      actorPrincipalRef: 'prn_00000000000000000000000000000001',
      activeAccountRef: 'acc_00000000000000000000000000000001',
      activeAccountRevision: 1,
      correlationRef: 'correlation:lying-execution-port',
      idempotencyRef: 'idempotency:lying-execution-port',
    }
    const receipt = {
      planDigest: plan.planDigest,
      executionRef: 'reset-execution:forged-trusted',
      transactionRef: 'reset-transaction:forged-trusted',
      removed: plan.targets.map(({ table, measuredFacts }) => ({ table, facts: measuredFacts })),
      createdAt: 100,
      createdBy: context,
    }
    let applyCalls = 0
    const lyingCapability = {
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
      readSnapshot: async () => ({ observationRef: 'reset-observation:lying', observedAt: 101, counts: [] }),
    }
    const lyingPort: LegacyIdentityResetExecutionPort = {
      mutation: lyingCapability,
      evidence: lyingCapability,
      inventory: lyingCapability,
    }

    await expect(executeLegacyIdentityReset(plan, lyingPort, {
      apply: true,
      confirmedPlanDigest: plan.planDigest,
      context,
    })).rejects.toMatchObject({ code: 'reset_port_trust_invalid' })
    expect(applyCalls).toBe(0)
    expect(liveCounts.get('owners')).toBe(2)
    expect(liveCounts.get('agentAccessPrincipals')).toBe(3)
  })

  it('rejects false durable evidence when independent live inventory still contains target facts', async () => {
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
      snapshotRef: 'snapshot:acceptance:independent-inventory',
      targets: ['owners', 'agentAccessPrincipals'],
    })
    const context: LegacyIdentityResetActionContext = {
      actorPrincipalRef: 'prn_00000000000000000000000000000001',
      activeAccountRef: 'acc_00000000000000000000000000000001',
      activeAccountRevision: 1,
      correlationRef: 'correlation:independent-inventory',
      idempotencyRef: 'idempotency:independent-inventory',
    }
    const receipt = {
      planDigest: plan.planDigest,
      executionRef: 'reset-execution:false-evidence',
      transactionRef: 'reset-transaction:false-evidence',
      removed: plan.targets.map(({ table, measuredFacts }) => ({ table, facts: measuredFacts })),
      createdAt: 101,
      createdBy: context,
    }
    const ports: LegacyIdentityResetExecutionPort = {
      mutation: { applyExact: async () => receipt },
      evidence: {
        findReceipt: async () => receipt,
        readTrustedExecution: async () => ({
          ...receipt,
          targetPostState: plan.targets.map(({ table }) => ({ table, facts: 0 })),
          retainedCanonicalPostState: plan.retainedCanonical.map(({ table, measuredFacts }) => ({
            table,
            facts: measuredFacts,
          })),
        }),
      },
      inventory: {
        readSnapshot: async () => ({
          observationRef: 'reset-observation:independent',
          observedAt: 102,
          counts: [
            ...plan.targets.map(({ table }) => ({ table, facts: liveCounts.get(table) ?? 0 })),
            ...plan.retainedCanonical.map(({ table }) => ({ table, facts: liveCounts.get(table) ?? 0 })),
          ],
        }),
      },
    }

    await expect(executeLegacyIdentityReset(plan, ports, {
      apply: true,
      confirmedPlanDigest: plan.planDigest,
      context,
    })).rejects.toMatchObject({ code: 'reset_target_not_empty' })
  })
})
