import { describe, expect, it } from 'vitest'

import {
  CANONICAL_IDENTITY_TABLES,
  LEGACY_IDENTITY_RESET_MANIFEST,
  LegacyIdentityResetError,
  executeLegacyIdentityReset,
  planLegacyIdentityReset,
  type CanonicalIdentityTable,
  type LegacyIdentityResetActionContext,
  type LegacyIdentityResetApplyReceipt,
  type LegacyIdentityResetExecutionPort,
  type LegacyIdentityResetExecutionIdentity,
  type LegacyIdentityResetPlan,
  type LegacyIdentityResetReconciliationSnapshot,
  type LegacyIdentityResetTrustedExecution,
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
  readonly executions = new Map<string, LegacyIdentityResetTrustedExecution>()
  readonly postCounts = new Map<LegacyIdentityTable | CanonicalIdentityTable, number>([
    ['owners', 0],
    ['agentAccessPrincipals', 0],
    ...CANONICAL_IDENTITY_TABLES.map((table) => [table, counts[table]] as const),
  ])
  applyCalls = 0
  receiptOverride?: LegacyIdentityResetApplyReceipt
  executionOverride?: LegacyIdentityResetTrustedExecution
  snapshotOverride?: LegacyIdentityResetReconciliationSnapshot

  readonly mutation = {
    applyExact: async (plan: LegacyIdentityResetPlan, context: LegacyIdentityResetActionContext) => {
      this.applyCalls += 1
      const receipt = this.receiptOverride !== undefined ? this.receiptOverride : Object.freeze({
        planDigest: plan.planDigest,
        executionRef: 'reset-execution:memory',
        transactionRef: 'reset-transaction:memory',
        removed: Object.freeze(plan.targets.map(({ table, measuredFacts }) => Object.freeze({ table, facts: measuredFacts }))),
        createdAt: 100,
        createdBy: context,
      })
      this.receipts.set(plan.planDigest, receipt)
      if (this.receiptOverride === undefined) {
        this.executions.set(receipt.executionRef, trustedExecution(plan, receipt))
      }
      return receipt
    },
  }

  readonly evidence = {
    findReceipt: async (planDigest: string) => this.receipts.get(planDigest),
    readTrustedExecution: async (identity: LegacyIdentityResetExecutionIdentity) => (
      this.executionOverride ?? this.executions.get(identity.executionRef)
    ),
  }

  readonly inventory = {
    readSnapshot: async () => this.snapshotOverride !== undefined
      ? this.snapshotOverride
      : ({
          observationRef: 'reset-observation:memory',
          observedAt: 101,
          counts: [
            ...LEGACY_IDENTITY_RESET_MANIFEST.map(({ table }) => ({ table, facts: this.postCounts.get(table) ?? 0 })),
            ...CANONICAL_IDENTITY_TABLES.map((table) => ({ table, facts: this.postCounts.get(table) ?? 0 })),
          ],
        }),
  }
}

const resetContext: LegacyIdentityResetActionContext = Object.freeze({
  actorPrincipalRef: 'prn_00000000000000000000000000000001',
  activeAccountRef: 'acc_00000000000000000000000000000001',
  activeAccountRevision: 7,
  correlationRef: 'correlation:reset:test',
  idempotencyRef: 'idempotency:reset:test',
})

function applyOptions(plan: LegacyIdentityResetPlan) {
  return { apply: true, confirmedPlanDigest: plan.planDigest, context: resetContext } as const
}

function receiptFor(plan: LegacyIdentityResetPlan): LegacyIdentityResetApplyReceipt {
  return {
    planDigest: plan.planDigest,
    executionRef: 'reset-execution:test',
    transactionRef: 'reset-transaction:test',
    removed: plan.targets.map(({ table, measuredFacts }) => ({ table, facts: measuredFacts })),
    createdAt: 100,
    createdBy: resetContext,
  }
}

function trustedExecution(
  plan: LegacyIdentityResetPlan,
  receipt: LegacyIdentityResetApplyReceipt = receiptFor(plan),
): LegacyIdentityResetTrustedExecution {
  return {
    ...receipt,
    targetPostState: plan.targets.map(({ table }) => ({ table, facts: 0 })),
    retainedCanonicalPostState: plan.retainedCanonical.map(({ table, measuredFacts }) => ({ table, facts: measuredFacts })),
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
    await expectCode(executeLegacyIdentityReset(plan, port, { apply: true, confirmedPlanDigest: plan.planDigest }), 'reset_action_context_required')
    const applied = await executeLegacyIdentityReset(plan, port, applyOptions(plan))
    expect(applied).toMatchObject({
      mode: 'applied',
      executionRef: 'reset-execution:memory',
      transactionRef: 'reset-transaction:memory',
      factsPlannedForRemoval: 5,
      factsRemoved: 5,
      canonicalFactsRetained: 112,
    })
    expect(applied.removed).toEqual([
      { table: 'owners', facts: 2 },
      { table: 'agentAccessPrincipals', facts: 3 },
    ])
    expect(port.applyCalls).toBe(1)
  })

  it('rejects malformed action attribution and non-independent execution capabilities', async () => {
    const plan = await createPlan()
    const port = new MemoryExecutionPort()
    const invalidContexts: readonly unknown[] = [
      null,
      { ...resetContext, actorPrincipalRef: 1 },
      { ...resetContext, actorPrincipalRef: 'bad ref' },
      { ...resetContext, activeAccountRef: 1 },
      { ...resetContext, activeAccountRef: 'bad ref' },
      { ...resetContext, activeAccountRevision: 1.5 },
      { ...resetContext, activeAccountRevision: 0 },
      { ...resetContext, correlationRef: 1 },
      { ...resetContext, correlationRef: 'bad ref' },
      { ...resetContext, idempotencyRef: 1 },
      { ...resetContext, idempotencyRef: 'bad ref' },
    ]
    for (const context of invalidContexts) {
      await expectCode(executeLegacyIdentityReset(plan, port, {
        apply: true,
        confirmedPlanDigest: plan.planDigest,
        context: context as LegacyIdentityResetActionContext,
      }), 'reset_action_context_invalid')
    }

    const invalidPorts: readonly unknown[] = [
      null,
      { ...port, mutation: null },
      { ...port, evidence: null },
      { ...port, inventory: null },
      { ...port, mutation: {} },
      { ...port, evidence: { readTrustedExecution: port.evidence.readTrustedExecution } },
      { ...port, evidence: { findReceipt: port.evidence.findReceipt } },
      { ...port, inventory: {} },
    ]
    for (const invalidPort of invalidPorts) {
      await expectCode(executeLegacyIdentityReset(
        plan,
        invalidPort as LegacyIdentityResetExecutionPort,
        applyOptions(plan),
      ), 'reset_port_trust_invalid')
    }
  })

  it('replays an exact prior receipt idempotently without a second apply', async () => {
    const plan = await createPlan()
    const port = new MemoryExecutionPort()
    await executeLegacyIdentityReset(plan, port, applyOptions(plan))
    const replay = await executeLegacyIdentityReset(plan, port, applyOptions(plan))
    expect(replay).toMatchObject({
      mode: 'already-applied',
      executionRef: 'reset-execution:memory',
      transactionRef: 'reset-transaction:memory',
      factsRemoved: 5,
    })
    expect(port.applyCalls).toBe(1)
  })

  it('rejects a valid receipt unless a trusted durable execution exists', async () => {
    const plan = await createPlan()
    const receipt = receiptFor(plan)
    const replayPort = new MemoryExecutionPort()
    replayPort.receipts.set(plan.planDigest, receipt)
    await expectCode(
      executeLegacyIdentityReset(plan, replayPort, applyOptions(plan)),
      'reset_receipt_untrusted',
    )

    const applyPort = new MemoryExecutionPort()
    applyPort.receiptOverride = receipt
    await expectCode(
      executeLegacyIdentityReset(plan, applyPort, applyOptions(plan)),
      'reset_receipt_untrusted',
    )
  })

  it('binds a trusted execution to the exact execution, transaction, plan and receipt', async () => {
    const plan = await createPlan()
    const receipt = receiptFor(plan)
    const cases: readonly [LegacyIdentityResetTrustedExecution, string][] = [
      [{ ...trustedExecution(plan, receipt), executionRef: 'reset-execution:other' }, 'reset_execution_mismatch'],
      [{ ...trustedExecution(plan, receipt), transactionRef: 'reset-transaction:other' }, 'reset_transaction_mismatch'],
      [{ ...trustedExecution(plan, receipt), planDigest: `sha256:${'f'.repeat(64)}` }, 'reset_execution_mismatch'],
      [{ ...trustedExecution(plan, receipt), removed: [{ table: 'owners', facts: 1 }, { table: 'agentAccessPrincipals', facts: 3 }] }, 'reset_execution_mismatch'],
    ]
    for (const [execution, code] of cases) {
      const port = new MemoryExecutionPort()
      port.receipts.set(plan.planDigest, receipt)
      port.executionOverride = execution
      await expectCode(
        executeLegacyIdentityReset(plan, port, applyOptions(plan)),
        code,
      )
    }
  })

  it('reports removal only after every target reconciles to zero', async () => {
    const plan = await createPlan()
    const receipt = receiptFor(plan)
    const port = new MemoryExecutionPort()
    port.receipts.set(plan.planDigest, receipt)
    port.executionOverride = {
      ...trustedExecution(plan, receipt),
      targetPostState: [{ table: 'owners', facts: 1 }, { table: 'agentAccessPrincipals', facts: 0 }],
    }
    await expectCode(
      executeLegacyIdentityReset(plan, port, applyOptions(plan)),
      'reset_target_not_empty',
    )
  })

  it('reports removal only when all six protected canonical counts are unchanged', async () => {
    const plan = await createPlan()
    const receipt = receiptFor(plan)
    const port = new MemoryExecutionPort()
    port.receipts.set(plan.planDigest, receipt)
    port.executionOverride = {
      ...trustedExecution(plan, receipt),
      retainedCanonicalPostState: plan.retainedCanonical.map(({ table, measuredFacts }, index) => ({
        table,
        facts: measuredFacts + (index === 5 ? 1 : 0),
      })),
    }
    await expectCode(
      executeLegacyIdentityReset(plan, port, applyOptions(plan)),
      'reset_canonical_count_changed',
    )

    const independentlyDrifted = new MemoryExecutionPort()
    independentlyDrifted.receipts.set(plan.planDigest, receipt)
    independentlyDrifted.executions.set(receipt.executionRef, trustedExecution(plan, receipt))
    independentlyDrifted.postCounts.set('credentials', counts.credentials + 1)
    await expectCode(
      executeLegacyIdentityReset(plan, independentlyDrifted, applyOptions(plan)),
      'reset_canonical_count_changed',
    )
  })

  it('fails closed on malformed or table-mismatched trusted post-state', async () => {
    const plan = await createPlan()
    const receipt = receiptFor(plan)
    const valid = trustedExecution(plan, receipt)
    const cases: readonly LegacyIdentityResetTrustedExecution[] = [
      {} as unknown as LegacyIdentityResetTrustedExecution,
      { ...valid, targetPostState: [] },
      { ...valid, targetPostState: [null as unknown as LegacyIdentityResetTrustedExecution['targetPostState'][number], ...valid.targetPostState.slice(1)] },
      { ...valid, targetPostState: [{ table: 'agentAccessPrincipals', facts: 0 }, ...valid.targetPostState.slice(1)] },
      { ...valid, retainedCanonicalPostState: [] },
      { ...valid, retainedCanonicalPostState: [null as unknown as LegacyIdentityResetTrustedExecution['retainedCanonicalPostState'][number], ...valid.retainedCanonicalPostState.slice(1)] },
      { ...valid, retainedCanonicalPostState: [{ table: 'accounts', facts: 11 }, ...valid.retainedCanonicalPostState.slice(1)] },
    ]
    for (const execution of cases) {
      const port = new MemoryExecutionPort()
      port.receipts.set(plan.planDigest, receipt)
      port.executionOverride = execution
      await expectCode(
        executeLegacyIdentityReset(plan, port, applyOptions(plan)),
        'reset_post_state_invalid',
      )
    }
  })

  it('fails closed on malformed or table-mismatched independent inventory snapshots', async () => {
    const plan = await createPlan()
    const receipt = receiptFor(plan)
    const malformed = new MemoryExecutionPort()
    malformed.receipts.set(plan.planDigest, receipt)
    malformed.executions.set(receipt.executionRef, trustedExecution(plan, receipt))
    malformed.snapshotOverride = null as unknown as LegacyIdentityResetReconciliationSnapshot
    await expectCode(executeLegacyIdentityReset(plan, malformed, applyOptions(plan)), 'reset_post_state_invalid')

    const mismatched = new MemoryExecutionPort()
    mismatched.receipts.set(plan.planDigest, receipt)
    mismatched.executions.set(receipt.executionRef, trustedExecution(plan, receipt))
    mismatched.snapshotOverride = {
      observationRef: 'reset-observation:mismatched',
      observedAt: 101,
      counts: [],
    }
    await expectCode(executeLegacyIdentityReset(plan, mismatched, applyOptions(plan)), 'reset_post_state_invalid')
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
    const base = receiptFor(plan)
    const invalidReceipts: readonly LegacyIdentityResetApplyReceipt[] = [
      null as unknown as LegacyIdentityResetApplyReceipt,
      { ...base, planDigest: 1 as unknown as string, removed: [] },
      { ...base, executionRef: '' },
      { ...base, transactionRef: '' },
      { ...base, createdBy: null as unknown as LegacyIdentityResetActionContext },
      { ...base, removed: null as unknown as LegacyIdentityResetApplyReceipt['removed'] },
      { ...base, removed: [null as unknown as LegacyIdentityResetApplyReceipt['removed'][number]] },
      { ...base, removed: [{ table: 1 as unknown as LegacyIdentityTable, facts: 2 }] },
      { ...base, removed: [{ table: 'owners', facts: '2' as unknown as number }] },
      { ...base, planDigest: 'wrong' },
      { ...base, removed: [] },
      { ...base, removed: plan.targets.map(({ table, measuredFacts }, index) => ({ table: index === 0 ? 'agentAccessPrincipals' : table, facts: measuredFacts })) },
      { ...base, removed: plan.targets.map(({ table, measuredFacts }, index) => ({ table, facts: measuredFacts + (index === 0 ? 1 : 0) })) },
    ]
    for (const receipt of invalidReceipts) {
      const port = new MemoryExecutionPort()
      port.receiptOverride = receipt
      await expectCode(executeLegacyIdentityReset(plan, port, applyOptions(plan)), 'reset_receipt_invalid')
    }
    const priorPort = new MemoryExecutionPort()
    priorPort.receipts.set(plan.planDigest, invalidReceipts[9]!)
    await expectCode(executeLegacyIdentityReset(plan, priorPort, applyOptions(plan)), 'reset_receipt_invalid')
  })

  it('exposes stable typed errors for callers', () => {
    expect(new LegacyIdentityResetError('reset_unknown_target')).toMatchObject({
      name: 'LegacyIdentityResetError',
      code: 'reset_unknown_target',
      message: 'reset_unknown_target',
    })
  })
})
