import { describe, expect, it } from 'vitest'

import {
  CANONICAL_IDENTITY_TABLES,
  LEGACY_IDENTITY_RESET_MANIFEST,
  LegacyIdentityResetError,
  executeLegacyIdentityReset,
  planLegacyIdentityReset,
  type CanonicalIdentityTable,
  type LegacyIdentityResetApplyReceipt,
  type LegacyIdentityResetExecutionPort,
  type LegacyIdentityResetPlan,
  type LegacyIdentityTable,
} from '../../../../tools/maturity-reset/public'

const counts: Readonly<Record<LegacyIdentityTable | CanonicalIdentityTable, number>> = Object.freeze({
  owners: 2,
  agentAccessPrincipals: 3,
  principals: 11,
  accounts: 13,
  accountOwnerships: 17,
  memberships: 19,
  externalIdentityBindings: 23,
  credentials: 29,
})

async function createPlan(targets: readonly string[] = LEGACY_IDENTITY_RESET_MANIFEST.map(({ table }) => table)) {
  return await planLegacyIdentityReset({
    inventory: { countFacts: async (table) => counts[table] },
    snapshotRef: 'snapshot:phase-1:001',
    targets,
  })
}

class MemoryExecutionPort implements LegacyIdentityResetExecutionPort {
  readonly receipts = new Map<string, LegacyIdentityResetApplyReceipt>()
  applyCalls = 0
  receiptOverride?: LegacyIdentityResetApplyReceipt

  async findReceipt(planDigest: string): Promise<LegacyIdentityResetApplyReceipt | undefined> {
    return this.receipts.get(planDigest)
  }

  async applyExact(plan: LegacyIdentityResetPlan): Promise<LegacyIdentityResetApplyReceipt> {
    this.applyCalls += 1
    const receipt = this.receiptOverride !== undefined ? this.receiptOverride : Object.freeze({
      planDigest: plan.planDigest,
      removed: Object.freeze(plan.targets.map(({ table, measuredFacts }) => Object.freeze({ table, facts: measuredFacts }))),
    })
    this.receipts.set(plan.planDigest, receipt)
    return receipt
  }
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'LegacyIdentityResetError', code, message: code })
}

describe('legacy internal identity reset planning and execution', () => {
  it('plans only declared legacy identity facts and measures every protected canonical fact', async () => {
    const plan = await createPlan(['agentAccessPrincipals', 'owners'])
    expect(plan.targets.map(({ table }) => table)).toEqual(['owners', 'agentAccessPrincipals'])
    expect(plan.factsPlannedForRemoval).toBe(5)
    expect(plan.retainedCanonical.map(({ table }) => table)).toEqual(CANONICAL_IDENTITY_TABLES)
    expect(plan.canonicalFactsRetained).toBe(112)
    expect(plan.planDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.targets)).toBe(true)
    expect(Object.isFrozen(plan.retainedCanonical)).toBe(true)
  })

  it('produces the same exact digest for the same measured snapshot regardless of target input order', async () => {
    const first = await createPlan(['owners', 'agentAccessPrincipals'])
    const second = await createPlan(['agentAccessPrincipals', 'owners'])
    expect(second).toEqual(first)
  })

  it('fails closed on empty, malformed, duplicate, protected and unknown target requests', async () => {
    await expectCode(createPlan([]), 'reset_target_invalid')
    await expectCode(createPlan([1 as unknown as string]), 'reset_target_invalid')
    await expectCode(createPlan(['bad-table']), 'reset_target_invalid')
    await expectCode(createPlan(['owners', 'owners']), 'reset_duplicate_target')
    await expectCode(createPlan(['principals']), 'reset_protected_target')
    await expectCode(createPlan(['businesses']), 'reset_unknown_target')
  })

  it('rejects invalid snapshots, inventory counts and overflowing totals', async () => {
    await expectCode(planLegacyIdentityReset({ inventory: { countFacts: async () => 0 }, snapshotRef: '', targets: ['owners'] }), 'reset_snapshot_ref_invalid')
    await expectCode(planLegacyIdentityReset({ inventory: { countFacts: async () => 0 }, snapshotRef: 1 as unknown as string, targets: ['owners'] }), 'reset_snapshot_ref_invalid')
    await expectCode(planLegacyIdentityReset({ inventory: { countFacts: async () => -1 }, snapshotRef: 'snapshot:1', targets: ['owners'] }), 'reset_count_invalid')
    await expectCode(planLegacyIdentityReset({ inventory: { countFacts: async (table) => table === 'owners' ? Number.MAX_SAFE_INTEGER : 1 }, snapshotRef: 'snapshot:1', targets: ['owners', 'agentAccessPrincipals'] }), 'reset_count_invalid')
  })

  it('defaults to a non-mutating dry run with measured removal and retention totals', async () => {
    const plan = await createPlan()
    const port = new MemoryExecutionPort()
    const result = await executeLegacyIdentityReset(plan, port)
    expect(result).toEqual({
      mode: 'dry-run',
      planDigest: plan.planDigest,
      factsPlannedForRemoval: 5,
      factsRemoved: 0,
      canonicalFactsRetained: 112,
      removed: [],
    })
    expect(port.applyCalls).toBe(0)
    expect(Object.isFrozen(result)).toBe(true)
    await expect(executeLegacyIdentityReset(plan, port, { apply: false, confirmedPlanDigest: plan.planDigest })).resolves.toMatchObject({ mode: 'dry-run' })
  })

  it('requires the exact plan digest before one atomic apply', async () => {
    const plan = await createPlan()
    const port = new MemoryExecutionPort()
    await expectCode(executeLegacyIdentityReset(plan, port, { apply: true }), 'reset_apply_digest_required')
    await expectCode(executeLegacyIdentityReset(plan, port, { apply: true, confirmedPlanDigest: `sha256:${'0'.repeat(64)}` }), 'reset_plan_digest_invalid')
    const applied = await executeLegacyIdentityReset(plan, port, { apply: true, confirmedPlanDigest: plan.planDigest })
    expect(applied).toMatchObject({ mode: 'applied', factsPlannedForRemoval: 5, factsRemoved: 5, canonicalFactsRetained: 112 })
    expect(applied.removed).toEqual([
      { table: 'owners', facts: 2 },
      { table: 'agentAccessPrincipals', facts: 3 },
    ])
    expect(port.applyCalls).toBe(1)
  })

  it('replays an exact prior receipt idempotently without a second apply', async () => {
    const plan = await createPlan()
    const port = new MemoryExecutionPort()
    await executeLegacyIdentityReset(plan, port, { apply: true, confirmedPlanDigest: plan.planDigest })
    const replay = await executeLegacyIdentityReset(plan, port, { apply: true, confirmedPlanDigest: plan.planDigest })
    expect(replay).toMatchObject({ mode: 'already-applied', factsRemoved: 5 })
    expect(port.applyCalls).toBe(1)
  })

  it('rejects forged or internally inconsistent plans before consulting the execution port', async () => {
    const plan = await createPlan()
    const port = new MemoryExecutionPort()
    const invalidPlans: readonly [LegacyIdentityResetPlan, string][] = [
      [null as unknown as LegacyIdentityResetPlan, 'reset_plan_invalid'],
      [{ ...plan, format: 'bad' as LegacyIdentityResetPlan['format'] }, 'reset_plan_invalid'],
      [{ ...plan, targets: null as unknown as LegacyIdentityResetPlan['targets'] }, 'reset_plan_invalid'],
      [{ ...plan, retainedCanonical: null as unknown as LegacyIdentityResetPlan['retainedCanonical'] }, 'reset_plan_invalid'],
      [{ ...plan, targets: [] }, 'reset_target_invalid'],
      [{ ...plan, targets: [null as unknown as LegacyIdentityResetPlan['targets'][number], ...plan.targets.slice(1)] }, 'reset_plan_invalid'],
      [{ ...plan, targets: [{ ...plan.targets[0]!, table: 1 as unknown as LegacyIdentityTable }, ...plan.targets.slice(1)] }, 'reset_plan_invalid'],
      [{ ...plan, targets: [{ ...plan.targets[0]!, reason: 1 as unknown as string }, ...plan.targets.slice(1)] }, 'reset_plan_invalid'],
      [{ ...plan, targets: [{ ...plan.targets[0]!, measuredFacts: '1' as unknown as number }, ...plan.targets.slice(1)] }, 'reset_plan_invalid'],
      [{ ...plan, targets: [{ ...plan.targets[0]!, reason: 'forged' }, ...plan.targets.slice(1)] }, 'reset_plan_invalid'],
      [{ ...plan, targets: [{ ...plan.targets[0]!, measuredFacts: -1 }, ...plan.targets.slice(1)] }, 'reset_count_invalid'],
      [{ ...plan, retainedCanonical: plan.retainedCanonical.slice(1) }, 'reset_plan_invalid'],
      [{ ...plan, retainedCanonical: [null as unknown as LegacyIdentityResetPlan['retainedCanonical'][number], ...plan.retainedCanonical.slice(1)] }, 'reset_plan_invalid'],
      [{ ...plan, retainedCanonical: [{ ...plan.retainedCanonical[0]!, table: 1 as unknown as CanonicalIdentityTable }, ...plan.retainedCanonical.slice(1)] }, 'reset_plan_invalid'],
      [{ ...plan, retainedCanonical: [{ ...plan.retainedCanonical[0]!, measuredFacts: '1' as unknown as number }, ...plan.retainedCanonical.slice(1)] }, 'reset_plan_invalid'],
      [{ ...plan, retainedCanonical: [{ ...plan.retainedCanonical[0]!, table: 'accounts' }, ...plan.retainedCanonical.slice(1)] }, 'reset_plan_invalid'],
      [{ ...plan, retainedCanonical: [{ ...plan.retainedCanonical[0]!, measuredFacts: -1 }, ...plan.retainedCanonical.slice(1)] }, 'reset_count_invalid'],
      [{ ...plan, factsPlannedForRemoval: 11 }, 'reset_plan_digest_invalid'],
      [{ ...plan, canonicalFactsRetained: 113 }, 'reset_plan_digest_invalid'],
      [{ ...plan, planDigest: `sha256:${'f'.repeat(64)}` }, 'reset_plan_digest_invalid'],
    ]
    for (const [invalid, code] of invalidPlans) await expectCode(executeLegacyIdentityReset(invalid, port), code)
    expect(port.applyCalls).toBe(0)
  })

  it('fails closed on receipts that do not exactly reproduce the measured plan', async () => {
    const plan = await createPlan()
    const invalidReceipts: readonly LegacyIdentityResetApplyReceipt[] = [
      null as unknown as LegacyIdentityResetApplyReceipt,
      { planDigest: 1 as unknown as string, removed: [] },
      { planDigest: plan.planDigest, removed: null as unknown as LegacyIdentityResetApplyReceipt['removed'] },
      { planDigest: plan.planDigest, removed: [null as unknown as LegacyIdentityResetApplyReceipt['removed'][number]] },
      { planDigest: plan.planDigest, removed: [{ table: 1 as unknown as LegacyIdentityTable, facts: 2 }] },
      { planDigest: plan.planDigest, removed: [{ table: 'owners', facts: '2' as unknown as number }] },
      { planDigest: 'wrong', removed: plan.targets.map(({ table, measuredFacts }) => ({ table, facts: measuredFacts })) },
      { planDigest: plan.planDigest, removed: [] },
      { planDigest: plan.planDigest, removed: plan.targets.map(({ table, measuredFacts }, index) => ({ table: index === 0 ? 'agentAccessPrincipals' : table, facts: measuredFacts })) },
      { planDigest: plan.planDigest, removed: plan.targets.map(({ table, measuredFacts }, index) => ({ table, facts: measuredFacts + (index === 0 ? 1 : 0) })) },
    ]
    for (const receipt of invalidReceipts) {
      const port = new MemoryExecutionPort()
      port.receiptOverride = receipt
      await expectCode(executeLegacyIdentityReset(plan, port, { apply: true, confirmedPlanDigest: plan.planDigest }), 'reset_receipt_invalid')
    }
    const priorPort = new MemoryExecutionPort()
    priorPort.receipts.set(plan.planDigest, invalidReceipts[6]!)
    await expectCode(executeLegacyIdentityReset(plan, priorPort, { apply: true, confirmedPlanDigest: plan.planDigest }), 'reset_receipt_invalid')
  })

  it('exposes stable typed errors for callers', () => {
    expect(new LegacyIdentityResetError('reset_unknown_target')).toMatchObject({
      name: 'LegacyIdentityResetError',
      code: 'reset_unknown_target',
      message: 'reset_unknown_target',
    })
  })
})
