import { makeFunctionReference, type FunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DelegationService } from '@/modules/authority/delegation/public'

import convexCrons from '../../../convex/crons'
import {
  SYSTEM_WORKLOAD_ACCOUNT_REF,
  SYSTEM_WORKLOAD_PRINCIPAL_REF,
  WORKLOAD_CRON_DECLARATIONS,
  admitWorkloadCronHandler,
  bindWorkloadCronActionContext,
  parseWorkloadCronSnapshot,
  reconcileWorkloadCronSnapshotHandler,
  cleanupExpiredAgentAccessOAuthGrantsHandler,
  cleanupExpiredSourceWriteNoncesHandler,
  reconcileDueFacilitatorInvocationsHandler,
  refreshAgenticEconomyApiRegistryHandler,
  refreshCapabilitySupplyReadinessHandler,
  refreshCurrentMarketPresenceHandler,
  refreshFacilitatorDiscoveryHandler,
  observeX402TreasuryHandler,
  snapshotMarketplaceMetricsDayHandler,
  reconcileBusinessSupplyProjectionsHandler,
  dispatchWorkloadCronConsequenceHandler,
  type WorkloadCronSnapshot,
} from '../../../convex/workloadCron'
import {
  CANONICAL_ADMISSION,
  CANONICAL_WORKLOAD,
  CRON_FACILITATOR,
  CRON_FACILITATOR_INVOCATIONS,
  CRON_MARKET,
  CRON_OAUTH,
  CRON_READINESS,
  FakeDb,
  FakeRuntimeContext,
  WORKLOAD_AUTHORITY_QUERY_CHAIN,
  account,
  admitCron,
  assertWorkloadIsolationScenario,
  canonicalDb,
  createScheduledProbeHarness,
  dispatchConsequence,
  dispatchConsequenceArgs,
  expectParseSnapshotRejects,
  expectReconcileSnapshotRejects,
  expectResourceAccountReconciliation,
  membership,
  principal,
  queryContext,
  reconcileWorkload,
  refreshCapabilitySupplyReadinessRuntime,
  seedInvocationAuthority,
} from './workload-cron.harness'

const EXPECTED_BINDINGS = {
  'cleanup expired agent access oauth grants': 'workloadCron:cleanupExpiredAgentAccessOAuthGrants',
  'cleanup expired source write nonces': 'workloadCron:cleanupExpiredSourceWriteNonces',
  'reconcile due facilitator invocations': 'workloadCron:reconcileDueFacilitatorInvocations',
  'refresh Agentic Economy API registry': 'workloadCron:refreshAgenticEconomyApiRegistry',
  'refresh capability supply readiness': 'workloadCron:refreshCapabilitySupplyReadiness',
  'reconcile business supply projections': 'workloadCron:reconcileBusinessSupplyProjections',
  'refresh current market presence': 'workloadCron:refreshCurrentMarketPresence',
  'refresh facilitator discovery': 'workloadCron:refreshFacilitatorDiscovery',
  'observe x402 treasury': 'workloadCron:observeX402Treasury',
  'snapshot marketplace metrics day': 'workloadCron:snapshotMarketplaceMetricsDay',
} as const

const ACTION_HANDLERS = [
  reconcileDueFacilitatorInvocationsHandler,
  refreshFacilitatorDiscoveryHandler,
  refreshAgenticEconomyApiRegistryHandler,
  observeX402TreasuryHandler,
  snapshotMarketplaceMetricsDayHandler,
] as const

const ACTION_HANDLER_WORKLOAD_NAMES = [
  'reconcile due facilitator invocations',
  'refresh facilitator discovery',
  'refresh Agentic Economy API registry',
  'observe x402 treasury',
  'snapshot marketplace metrics day',
] as const

const MUTATION_HANDLERS = [
  refreshCurrentMarketPresenceHandler,
  refreshCapabilitySupplyReadinessHandler,
  reconcileBusinessSupplyProjectionsHandler,
  cleanupExpiredSourceWriteNoncesHandler,
  cleanupExpiredAgentAccessOAuthGrantsHandler,
] as const

const PRE_CLAIM_REFUND_OPERATIONS = [
  'capabilityCalls:claimAutomaticReconciliationCandidate',
  'capabilityCalls:finishAutomaticReconciliation',
] as const

const DECLARED_MUTATION_CONSEQUENCES = [
  'capabilityCalls:cancelBeforeClaim',
  'capabilityCalls:claimAutomaticReconciliationCandidate',
  'capabilityCalls:finishAutomaticReconciliation',
  'capabilityCallX402AuthorizationExpiry:queueExpiredX402Authorization',
  'capabilitySupply:recordCapabilityProbeResult',
  'facilitatorDiscovery:reconcile',
  'moneyX402PaymentAttempts:reconcileX402PaymentAttempt',
] as const

describe('System workload cron boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'))
  })

  it('binds the nine periodic registrations to workload admission wrappers, retaining on-demand facilitator authority', () => {
    const periodicBindings = Object.fromEntries(Object.entries(EXPECTED_BINDINGS).filter(([name]) => name !== 'refresh facilitator discovery'))
    expect(Object.keys(convexCrons.crons).sort()).toEqual(Object.keys(periodicBindings).sort())
    expect(Object.fromEntries(
      Object.entries(convexCrons.crons).map(([name, job]) => [name, job.name]),
    )).toEqual(periodicBindings)
    expect(Object.values(convexCrons.crons).every((job) => JSON.stringify(job.args) === '[{}]')).toBe(true)
    expect(convexCrons.crons['snapshot marketplace metrics day']?.schedule).toEqual({
      type: 'cron',
      cron: '10 16 * * *',
    })
  })

  it('declares every cron as one canonical workload Principal and Account with no exemption', () => {
    expect(WORKLOAD_CRON_DECLARATIONS).toHaveLength(10)
    expect(WORKLOAD_CRON_DECLARATIONS.map(({ name }) => name).sort()).toEqual(Object.keys(EXPECTED_BINDINGS).sort())
    expect(WORKLOAD_CRON_DECLARATIONS.every((declaration) => (
      declaration.authority === 'canonical_workload'
      && declaration.actorPrincipalRef === SYSTEM_WORKLOAD_PRINCIPAL_REF
      && declaration.activeAccountRef === SYSTEM_WORKLOAD_ACCOUNT_REF
    ))).toBe(true)
    expect(JSON.stringify(WORKLOAD_CRON_DECLARATIONS)).not.toMatch(/credential|provider|ownerId|principalId|superuser/iu)
  })

  it('runs the registered readiness cron handler from current canonical facts and denies missing authority before dispatch', async () => {
    const allowed = new FakeRuntimeContext(canonicalDb())
    await expect(refreshCapabilitySupplyReadinessRuntime(allowed.mutation(), {})).resolves.toBeNull()
    expect(allowed.dispatches).toEqual(['capabilitySupply:scheduleDueCapabilityProbes'])
    expect(allowed.db.queries).toEqual([...WORKLOAD_AUTHORITY_QUERY_CHAIN])

    const denied = new FakeRuntimeContext(new FakeDb())
    await expect(refreshCapabilitySupplyReadinessRuntime(denied.mutation(), {}))
      .rejects.toMatchObject({ code: 'workload_principal_missing' })
    expect(denied.dispatches).toEqual([])
  })

  it('runs the registered workload reconciliation query and denies a lifecycle change at consequence time', async () => {
    const db = canonicalDb()
    const snapshot = await admitCron(db, CRON_READINESS)

    await expect(reconcileWorkload(db, CRON_READINESS, snapshot)).resolves.toMatchObject({
      ...CANONICAL_ADMISSION,
    })

    const suspended = canonicalDb({ principalLifecycle: 'suspended' })
    await expect(reconcileWorkload(suspended, CRON_READINESS, snapshot))
      .rejects.toMatchObject({ code: 'workload_principal_inactive' })
  })

  it('runs the registered scheduled probe through reconciliation and the bound action context without widening authority', async () => {
    const db = canonicalDb()
    const snapshot = await admitCron(db, CRON_READINESS)
    const probe = createScheduledProbeHarness(db)

    await expect(probe.runProbe({
      publicationRef: 'publication:runtime-sink',
      expectedRevision: 1,
      workload: snapshot,
    })).resolves.toEqual({
      kind: 'unavailable',
      reason: 'publication_missing',
      evidenceRefs: [],
    })
    expect(probe.queryRefs).toEqual([
      'workloadCron:reconcile',
      'capabilitySupply:readCapabilityProbeTarget',
    ])
    expect(probe.targetArgs).toEqual([{
      publicationRef: 'publication:runtime-sink',
      expectedRevision: 1,
      now: expect.any(Number),
    }])
    expect(probe.runMutation).not.toHaveBeenCalled()

    await expect(probe.runProbe({
      publicationRef: 'publication:runtime-sink',
      expectedRevision: 1,
      workload: { ...snapshot, activeAccountRef: 'acc_ffffffffffffffffffffffffffffffff' },
    })).rejects.toMatchObject({ code: 'workload_snapshot_invalid' })
    expect(probe.queryRefs).toEqual([
      'workloadCron:reconcile',
      'capabilitySupply:readCapabilityProbeTarget',
    ])
    expect(probe.runMutation).not.toHaveBeenCalled()
  })

  it.each([
    {
      scenario: 'owner',
      allowed: false,
      makeDb: () => canonicalDb({ principalKind: 'agent', workloadOwnsAccount: true, includeMembership: false }),
      present: (value: WorkloadCronSnapshot) => value,
    },
    {
      scenario: 'member',
      allowed: false,
      makeDb: () => canonicalDb({ principalKind: 'agent' }),
      present: (value: WorkloadCronSnapshot) => value,
    },
    {
      scenario: 'workload',
      allowed: true,
      makeDb: () => canonicalDb(),
      present: (value: WorkloadCronSnapshot) => value,
    },
    {
      scenario: 'missing_workload',
      allowed: false,
      makeDb: () => new FakeDb(),
      present: (value: WorkloadCronSnapshot) => value,
    },
    {
      scenario: 'stranger',
      allowed: false,
      makeDb: () => canonicalDb({ includeOwnership: false, includeMembership: false }),
      present: (value: WorkloadCronSnapshot) => value,
    },
    {
      scenario: 'wrong_account',
      allowed: false,
      makeDb: () => {
        const db = canonicalDb({ includeMembership: false })
        db.seed('memberships', membership({ accountRef: 'acc_ffffffffffffffffffffffffffffffff' }))
        return db
      },
      present: (value: WorkloadCronSnapshot) => value,
    },
    // Workload snapshots carry revisions, not a grant generation. A stale
    // revision is reconciled to current facts by this registered boundary.
    {
      scenario: 'stale_generation',
      allowed: true,
      makeDb: () => canonicalDb(),
      present: (value: WorkloadCronSnapshot) => ({
        ...value,
        principalRevision: value.principalRevision - 1,
      }),
    },
  ])(
    'evaluates $scenario through the registered workload reconciliation and scheduled probe before dispatch',
    async (scenario) => assertWorkloadIsolationScenario(scenario),
  )

  it('admits every declared job from current canonical membership facts', async () => {
    const db = canonicalDb()
    for (const [index, declaration] of WORKLOAD_CRON_DECLARATIONS.entries()) {
      const admission = index === 0
        ? admitWorkloadCronHandler(queryContext(db) as Parameters<typeof admitWorkloadCronHandler>[0], { name: declaration.name })
        : admitCron(db, declaration.name)
      await expect(admission).resolves.toMatchObject({
        workloadKind: declaration.workloadKind,
        ...CANONICAL_ADMISSION,
        accessVia: 'membership',
        admittedAt: Date.now(),
      })
    }
  })

  it('admits the same exact Account through current canonical ownership', async () => {
    const db = canonicalDb({ workloadOwnsAccount: true, includeMembership: false })
    await expect(admitCron(db, CRON_MARKET)).resolves.toMatchObject({
      accessVia: 'ownership',
      ...CANONICAL_WORKLOAD,
    })
  })

  it.each([
    {
      scenario: 'missing_workload_principal',
      makeDb: () => new FakeDb(),
      cronName: CRON_MARKET,
      expected: { code: 'workload_principal_missing' },
    },
    {
      scenario: 'ambiguous_workload_principal',
      makeDb: () => {
        const ambiguous = canonicalDb()
        ambiguous.seed('principals', principal())
        return ambiguous
      },
      cronName: CRON_MARKET,
      expectedError: 'unique query returned more than one row',
    },
    {
      scenario: 'non_workload_principal_kind',
      makeDb: () => canonicalDb({ principalKind: 'agent' }),
      cronName: CRON_FACILITATOR,
      expected: { code: 'workload_principal_kind_required' },
    },
    {
      scenario: 'inactive_workload_principal',
      makeDb: () => canonicalDb({ principalLifecycle: 'suspended' }),
      cronName: CRON_FACILITATOR,
      expected: { code: 'workload_principal_inactive' },
    },
    {
      scenario: 'missing_workload_account',
      makeDb: () => canonicalDb({ includeAccount: false, includeOwnership: false, includeMembership: false }),
      cronName: CRON_OAUTH,
      expected: { code: 'workload_account_missing' },
    },
    {
      scenario: 'ambiguous_workload_account',
      makeDb: () => {
        const ambiguous = canonicalDb()
        ambiguous.seed('accounts', account())
        return ambiguous
      },
      cronName: CRON_OAUTH,
      expectedError: 'unique query returned more than one row',
    },
    {
      scenario: 'inactive_workload_account',
      makeDb: () => canonicalDb({ accountLifecycle: 'suspended' }),
      cronName: CRON_OAUTH,
      expected: { code: 'workload_account_inactive' },
    },
    {
      scenario: 'stale_workload_ownership',
      makeDb: () => canonicalDb({ includeOwnership: false }),
      cronName: CRON_READINESS,
      expected: { code: 'workload_record_integrity_invalid' },
    },
    {
      scenario: 'wrong_account_membership',
      makeDb: () => {
        const wrongAccount = canonicalDb({ includeMembership: false })
        wrongAccount.seed('memberships', membership({ accountRef: 'acc_ffffffffffffffffffffffffffffffff' }))
        return wrongAccount
      },
      cronName: CRON_READINESS,
      expected: { code: 'workload_account_access_forbidden' },
    },
    {
      scenario: 'ambiguous_workload_membership',
      makeDb: () => {
        const ambiguousMembership = canonicalDb()
        ambiguousMembership.seed('memberships', membership())
        return ambiguousMembership
      },
      cronName: CRON_READINESS,
      expectedError: 'unique query returned more than one row',
    },
  ] as const satisfies ReadonlyArray<{
    scenario: string
    makeDb: () => FakeDb
    cronName: typeof WORKLOAD_CRON_DECLARATIONS[number]['name']
    expected?: { code: string }
    expectedError?: string
  }>)('denies workload cron admission when $scenario', async ({ makeDb, cronName, expected, expectedError }) => {
    const admission = admitCron(makeDb(), cronName)
    if (expected !== undefined) {
      await expect(admission).rejects.toMatchObject(expected)
      return
    }
    await expect(admission).rejects.toThrow(expectedError)
  })

  it('checks current workload authority before dispatch across every registered wrapper', async () => {
    const context = new FakeRuntimeContext(canonicalDb())
    for (const handler of ACTION_HANDLERS) await expect(handler(context.action())).resolves.toBeNull()
    for (const handler of MUTATION_HANDLERS) await expect(handler(context.mutation())).resolves.toBeNull()

    expect(context.admissions).toEqual([...ACTION_HANDLER_WORKLOAD_NAMES])
    // 11 dispatches: ten scheduled wrappers, with business projection
    // reconciliation dispatching two mutations under one admission.
    expect(context.dispatches).toHaveLength(11)
    expect([...context.db.queries].sort()).toEqual(Array.from({ length: 10 }, () => [...WORKLOAD_AUTHORITY_QUERY_CHAIN]).flat().sort())
    expect(context.trace.every(([admission, dispatch]) => admission < dispatch)).toBe(true)
  })

  it('denies missing workload facts before dispatch', async () => {
    const context = new FakeRuntimeContext(new FakeDb())
    await expect(reconcileDueFacilitatorInvocationsHandler(context.action()))
      .rejects.toMatchObject({ code: 'workload_principal_missing' })
    await expect(cleanupExpiredAgentAccessOAuthGrantsHandler(context.mutation()))
      .rejects.toMatchObject({ code: 'workload_principal_missing' })
    expect(context.dispatches).toEqual([])
  })

  it('preserves an unknown external target outcome instead of translating or retrying it', async () => {
    const uncertain = new Error('external_outcome_unknown')
    const context = new FakeRuntimeContext(canonicalDb(), uncertain)
    await expect(refreshFacilitatorDiscoveryHandler(context.action())).rejects.toBe(uncertain)
    expect(context.dispatches).toEqual(['facilitatorDiscoveryAction:run'])
  })

  it.each([
    {
      scenario: 'wrong_cron_name',
      patch: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, name: CRON_MARKET }),
    },
    {
      scenario: 'wrong_workload_kind',
      patch: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, workloadKind: 'job' as const }),
    },
    {
      scenario: 'forged_actor_principal',
      patch: (snapshot: WorkloadCronSnapshot) => ({
        ...snapshot,
        actorPrincipalRef: 'prn_ffffffffffffffffffffffffffffffff' as WorkloadCronSnapshot['actorPrincipalRef'],
      }),
    },
    {
      scenario: 'forged_active_account',
      patch: (snapshot: WorkloadCronSnapshot) => ({
        ...snapshot,
        activeAccountRef: 'acc_ffffffffffffffffffffffffffffffff' as WorkloadCronSnapshot['activeAccountRef'],
      }),
    },
    {
      scenario: 'forged_purpose',
      patch: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, purpose: 'forged purpose' }),
    },
    {
      scenario: 'forged_source',
      patch: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, source: 'forged/source' }),
    },
    {
      scenario: 'non_integer_admitted_at',
      patch: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, admittedAt: 1.5 }),
    },
    {
      scenario: 'future_admitted_at',
      patch: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, admittedAt: Date.now() + 1 }),
    },
  ])('rejects $scenario workload snapshot before rereading authority', async ({ patch }) => {
    await expectReconcileSnapshotRejects(patch)
  })

  it('accepts a current workload snapshot through reconcileWorkloadCronSnapshotHandler', async () => {
    const db = canonicalDb()
    const snapshot = await admitCron(db, CRON_FACILITATOR)
    await expect(reconcileWorkloadCronSnapshotHandler(
      queryContext(db) as Parameters<typeof reconcileWorkloadCronSnapshotHandler>[0],
      { name: CRON_FACILITATOR, snapshot },
    )).resolves.toMatchObject({ name: CRON_FACILITATOR })
  })

  it('parses the hostile validator boundary into branded immutable refs', async () => {
    const snapshot = await admitCron(canonicalDb(), CRON_FACILITATOR)
    expect(parseWorkloadCronSnapshot({ ...snapshot })).toEqual(snapshot)
    expect(Object.isFrozen(parseWorkloadCronSnapshot({ ...snapshot }))).toBe(true)
  })

  it.each([
    {
      scenario: 'null_snapshot',
      invalid: (_snapshot: WorkloadCronSnapshot) => null,
    },
    {
      scenario: 'array_snapshot',
      invalid: () => [],
    },
    {
      scenario: 'extra_field',
      invalid: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, extra: true }),
    },
    {
      scenario: 'missing_source',
      invalid: (snapshot: WorkloadCronSnapshot) => Object.fromEntries(
        Object.entries(snapshot).filter(([key]) => key !== 'source'),
      ),
    },
    {
      scenario: 'undeclared_cron_name',
      invalid: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, name: 'not-declared' }),
    },
    {
      scenario: 'zero_principal_revision',
      invalid: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, principalRevision: 0 }),
    },
    {
      scenario: 'invalid_correlation_ref',
      invalid: (snapshot: WorkloadCronSnapshot) => ({ ...snapshot, correlationRef: 'bad correlation ref' }),
    },
  ])('rejects $scenario at parseWorkloadCronSnapshot', async ({ invalid }) => {
    await expectParseSnapshotRejects(invalid)
  })

  it('reconciles same-Account and explicit cross-Account payout attribution from canonical account facts', async () => {
    const db = canonicalDb()
    const snapshot = await admitCron(db, CRON_OAUTH)
    await expectResourceAccountReconciliation(db, snapshot, SYSTEM_WORKLOAD_ACCOUNT_REF)
    const resourceAccountRef = 'acc_dddddddddddddddddddddddddddddddd'
    db.seed('accounts', { ...account(), accountRef: resourceAccountRef })
    await expectResourceAccountReconciliation(db, snapshot, resourceAccountRef)
  })

  it('binds reconciliation resources only through a current full-chain grant admission and dual Account attribution', async () => {
    const db = canonicalDb()
    const snapshot = await admitCron(db, CRON_FACILITATOR_INVOCATIONS)
    const missing = new FakeRuntimeContext(db)
    await expect(dispatchConsequence(missing, snapshot, { resourceInvocationRef: 'inv_missing' }))
      .rejects.toMatchObject({ code: 'workload_resource_authority_invalid' })

    seedInvocationAuthority(db, { grantAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF })
    const sameAccount = new FakeRuntimeContext(db)
    await expect(dispatchConsequence(sameAccount, snapshot)).resolves.toBeNull()

    const crossDb = canonicalDb()
    seedInvocationAuthority(crossDb, { grantAccountRef: 'acc_dddddddddddddddddddddddddddddddd' })
    const crossAccount = new FakeRuntimeContext(crossDb)
    await expect(dispatchConsequence(crossAccount, snapshot)).resolves.toBeNull()
  })

  it.each([
    { scenario: 'missing_grant', seed: { includeGrant: false } },
    { scenario: 'revoked_leaf_grant', seed: { leafLifecycle: 'revoked' as const } },
    { scenario: 'stale_access_grant_generation', seed: { accessGrantGeneration: 8 } },
    { scenario: 'expired_grant', seed: { grantExpiresAt: Date.now() } },
    { scenario: 'revoked_root_grant', seed: { rootLifecycle: 'revoked' as const } },
    { scenario: 'malformed_grant_chain', seed: { malformedChain: true } },
    { scenario: 'wrong_invocation_principal', seed: { invocationPrincipalRef: 'prn_ffffffffffffffffffffffffffffffff' } },
    { scenario: 'wrong_invocation_account', seed: { invocationAccountRef: 'acc_ffffffffffffffffffffffffffffffff' } },
    { scenario: 'future_invocation_grant_expiry', seed: { invocationGrantExpiresAt: Date.now() + 1 } },
    { scenario: 'undelegated_invocation_operation', seed: { invocationOperationRef: 'operation:not-delegated' } },
  ])('denies $scenario before workload resource dispatch', async ({ seed }) => {
    const db = canonicalDb()
    seedInvocationAuthority(db, seed)
    const snapshot = await admitCron(db, CRON_FACILITATOR_INVOCATIONS)
    const context = new FakeRuntimeContext(db)
    await expect(dispatchConsequence(context, snapshot))
      .rejects.toMatchObject({ code: 'workload_resource_authority_invalid' })
    expect(context.dispatches).toEqual([])
  })

  it('keeps canonical and access generations distinct and admits canonical wildcard resources', async () => {
    const db = canonicalDb()
    seedInvocationAuthority(db, { grantGeneration: 3, wildcard: true })
    const snapshot = await admitCron(db, CRON_FACILITATOR_INVOCATIONS)
    const context = new FakeRuntimeContext(db)
    await expect(dispatchConsequence(context, snapshot)).resolves.toBeNull()
    expect(context.dispatches).toEqual(['facilitatorDiscovery:reconcile'])
  })

  it.each([
    { scenario: 'expired_grant', boundary: { grantExpiresAt: Date.now() - 1 } },
    { scenario: 'revoked_leaf_grant', boundary: { leafLifecycle: 'revoked' as const } },
    { scenario: 'revoked_root_grant', boundary: { rootLifecycle: 'revoked' as const } },
  ])('allows only proven same-Call refund bookkeeping after $scenario', async ({ boundary }) => {
    const db = canonicalDb()
    seedInvocationAuthority(db, { ...boundary, wildcard: true, preClaimRefund: true })
    const snapshot = await admitCron(db, CRON_FACILITATOR_INVOCATIONS)
    const context = new FakeRuntimeContext(db)
    for (const operation of PRE_CLAIM_REFUND_OPERATIONS) {
      await expect(dispatchConsequence(context, snapshot, {
        operation,
        payload: { callRef: 'inv_cron' },
      })).resolves.toBeNull()
    }
    await expect(dispatchConsequence(context, snapshot))
      .rejects.toMatchObject({ code: 'workload_resource_authority_invalid' })
    await expect(dispatchConsequence(context, snapshot, {
      operation: 'capabilityCalls:claimAutomaticReconciliationCandidate',
      payload: { callRef: 'inv_other' },
    })).rejects.toMatchObject({ code: 'workload_resource_authority_invalid' })
    db.seed('actionExecutionAttempts', { executionRef: 'inv_cron', attemptNumber: 1 })
    await expect(dispatchConsequence(context, snapshot, {
      operation: 'capabilityCalls:claimAutomaticReconciliationCandidate',
      payload: { callRef: 'inv_cron' },
    })).rejects.toMatchObject({ code: 'workload_resource_authority_invalid' })
    expect(context.dispatches).toEqual([...PRE_CLAIM_REFUND_OPERATIONS])
  })

  it('fails closed on inconsistent admitted snapshots while preserving unexpected store failures', async () => {
    const db = canonicalDb()
    seedInvocationAuthority(db)
    const snapshot = await admitCron(db, CRON_FACILITATOR_INVOCATIONS)
    const context = new FakeRuntimeContext(db)
    vi.spyOn(DelegationService.prototype, 'admitConsequence').mockResolvedValueOnce({
      grantRef: 'grt_ffffffffffffffffffffffffffffffff',
      generation: 7,
      accountRef: 'acc_dddddddddddddddddddddddddddddddd',
      actorPrincipalRef: 'prn_cccccccccccccccccccccccccccccccc',
      expiresAt: Date.now() + 1,
    } as never)
    await expect(dispatchConsequence(context, snapshot))
      .rejects.toMatchObject({ code: 'workload_resource_authority_invalid' })

    const unexpected = new Error('store_unavailable')
    vi.spyOn(DelegationService.prototype, 'admitConsequence').mockRejectedValueOnce(unexpected)
    await expect(dispatchConsequence(context, snapshot)).rejects.toBe(unexpected)
  })

  it('routes every declared mutation consequence through same-transaction current admission', async () => {
    const context = new FakeRuntimeContext(canonicalDb())
    const snapshot = await admitCron(context.db, CRON_FACILITATOR)
    for (const operation of DECLARED_MUTATION_CONSEQUENCES) {
      await expect(dispatchWorkloadCronConsequenceHandler(
        context.mutation() as Parameters<typeof dispatchWorkloadCronConsequenceHandler>[0],
        dispatchConsequenceArgs(snapshot, { name: CRON_FACILITATOR, operation, payload: { marker: operation } }) as never,
      )).resolves.toBeNull()
    }
    expect(context.dispatches).toEqual(DECLARED_MUTATION_CONSEQUENCES)
  })

  it('rejects undeclared mutation consequences before the proxy dispatches', async () => {
    const context = new FakeRuntimeContext(canonicalDb())
    const snapshot = await admitCron(context.db, CRON_FACILITATOR)
    const bound = bindWorkloadCronActionContext(context.action() as never, {
      name: CRON_FACILITATOR,
      snapshot,
    })
    expect(bound.runQuery).toBeTypeOf('function')
    const undeclared = makeFunctionReference<'mutation'>('undeclared:mutation') as unknown as FunctionReference<'mutation', 'internal'>
    await expect(bound.runMutation(undeclared, {})).rejects.toMatchObject({
      code: 'workload_consequence_not_declared',
    })
    expect(context.dispatches).toEqual([])
  })

  it('projects declared action consequences into the admitted dispatcher with optional resource attribution', async () => {
    const context = new FakeRuntimeContext(canonicalDb())
    const snapshot = await admitCron(context.db, CRON_FACILITATOR)
    const declared = makeFunctionReference<'mutation'>('facilitatorDiscovery:reconcile') as unknown as FunctionReference<'mutation', 'internal'>
    const unscoped = bindWorkloadCronActionContext(context.action() as never, {
      name: CRON_FACILITATOR,
      snapshot,
    })
    await expect(Reflect.apply(unscoped.runMutation, unscoped, [declared])).resolves.toBeNull()

    const scoped = bindWorkloadCronActionContext(context.action() as never, {
      name: CRON_FACILITATOR,
      snapshot,
      resourceInvocationRef: 'inv_cron',
    })
    await expect(scoped.runMutation(declared, { marker: true })).resolves.toBeNull()
    expect(context.dispatches).toEqual([
      'workloadCron:dispatchConsequence',
      'workloadCron:dispatchConsequence',
    ])
  })
})
