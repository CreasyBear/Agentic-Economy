import { getFunctionName, makeFunctionReference, type FunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DelegationService } from '@/modules/authority/delegation/public'

import convexCrons from '../../../convex/crons'
import { probeFromCron } from '../../../convex/capabilitySupplyReadiness'
import {
  PHASE_2_CRON_ACCOUNT_REF,
  PHASE_2_CRON_PRINCIPAL_REF,
  WORKLOAD_CRON_DECLARATIONS,
  admitWorkloadCron,
  admitWorkloadCronHandler,
  bindWorkloadCronActionContext,
  parseWorkloadCronSnapshot,
  reconcileWorkloadCronResourceAccount,
  cleanupExpiredAgentAccessOAuthGrantsHandler,
  cleanupExpiredSourceWriteNoncesHandler,
  continueMarketAggregateBackfillHandler,
  reconcileDueFacilitatorInvocationsHandler,
  reconcileWorkloadCronSnapshot,
  reconcileWorkloadCronSnapshotHandler,
  refreshAgenticEconomyApiRegistryHandler,
  refreshAgenticMarketSnapshotsHandler,
  refreshCapabilitySupplyReadinessHandler,
  refreshCapabilitySupplyReadiness,
  refreshCurrentMarketPresenceHandler,
  refreshFacilitatorDiscoveryHandler,
  runDailySupplierSettlementHandler,
  dispatchWorkloadCronConsequenceHandler,
  reconcile,
  type WorkloadCronActionContext,
  type WorkloadCronMutationContext,
  type WorkloadCronSnapshot,
} from '../../../convex/workloadCron'

type RegisteredRuntimeHandler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
const refreshCapabilitySupplyReadinessRuntime = (
  refreshCapabilitySupplyReadiness as unknown as { _handler: RegisteredRuntimeHandler }
)._handler
const reconcileRuntime = (reconcile as unknown as { _handler: RegisteredRuntimeHandler })._handler
const probeFromCronRuntime = (probeFromCron as unknown as { _handler: RegisteredRuntimeHandler })._handler

const EXPECTED_BINDINGS = {
  'cleanup expired agent access oauth grants': 'workloadCron:cleanupExpiredAgentAccessOAuthGrants',
  'cleanup expired source write nonces': 'workloadCron:cleanupExpiredSourceWriteNonces',
  'continue market aggregate backfill': 'workloadCron:continueMarketAggregateBackfill',
  'reconcile due facilitator invocations': 'workloadCron:reconcileDueFacilitatorInvocations',
  'refresh Agentic Economy API registry': 'workloadCron:refreshAgenticEconomyApiRegistry',
  'refresh Agentic Market snapshots': 'workloadCron:refreshAgenticMarketSnapshots',
  'refresh capability supply readiness': 'workloadCron:refreshCapabilitySupplyReadiness',
  'refresh current market presence': 'workloadCron:refreshCurrentMarketPresence',
  'refresh facilitator discovery': 'workloadCron:refreshFacilitatorDiscovery',
  'run daily supplier settlement': 'workloadCron:runDailySupplierSettlement',
} as const

const ACTION_HANDLERS = [
  reconcileDueFacilitatorInvocationsHandler,
  refreshFacilitatorDiscoveryHandler,
  refreshAgenticMarketSnapshotsHandler,
  refreshAgenticEconomyApiRegistryHandler,
] as const

const MUTATION_HANDLERS = [
  continueMarketAggregateBackfillHandler,
  refreshCurrentMarketPresenceHandler,
  refreshCapabilitySupplyReadinessHandler,
  cleanupExpiredSourceWriteNoncesHandler,
  cleanupExpiredAgentAccessOAuthGrantsHandler,
  runDailySupplierSettlementHandler,
] as const

describe('Phase 2 canonical workload cron boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'))
  })

  it('binds the exact ten cron registrations only to workload admission wrappers', () => {
    expect(Object.keys(convexCrons.crons).sort()).toEqual(Object.keys(EXPECTED_BINDINGS).sort())
    expect(Object.fromEntries(
      Object.entries(convexCrons.crons).map(([name, job]) => [name, job.name]),
    )).toEqual(EXPECTED_BINDINGS)
    expect(Object.values(convexCrons.crons).every((job) => JSON.stringify(job.args) === '[{}]')).toBe(true)
  })

  it('declares every cron as one canonical workload Principal and Account with no exemption', () => {
    expect(WORKLOAD_CRON_DECLARATIONS).toHaveLength(10)
    expect(WORKLOAD_CRON_DECLARATIONS.map(({ name }) => name).sort()).toEqual(Object.keys(EXPECTED_BINDINGS).sort())
    expect(WORKLOAD_CRON_DECLARATIONS.every((declaration) => (
      declaration.authority === 'canonical_workload'
      && declaration.actorPrincipalRef === PHASE_2_CRON_PRINCIPAL_REF
      && declaration.activeAccountRef === PHASE_2_CRON_ACCOUNT_REF
    ))).toBe(true)
    expect(JSON.stringify(WORKLOAD_CRON_DECLARATIONS)).not.toMatch(/credential|provider|ownerId|principalId|superuser/iu)
  })

  it('runs the registered readiness cron handler from current canonical facts and denies missing authority before dispatch', async () => {
    const allowed = new FakeRuntimeContext(canonicalDb())
    await expect(refreshCapabilitySupplyReadinessRuntime(allowed.mutation(), {})).resolves.toBeNull()
    expect(allowed.dispatches).toEqual(['capabilitySupply:scheduleDueCapabilityProbes'])
    expect(allowed.db.queries).toEqual([
      'principals',
      'accounts',
      'accountOwnerships',
      'memberships',
    ])

    const denied = new FakeRuntimeContext(new FakeDb())
    await expect(refreshCapabilitySupplyReadinessRuntime(denied.mutation(), {}))
      .rejects.toMatchObject({ code: 'workload_principal_missing' })
    expect(denied.dispatches).toEqual([])
  })

  it('runs the registered workload reconciliation query and denies a lifecycle change at consequence time', async () => {
    const db = canonicalDb()
    const snapshot = await admitWorkloadCron(queryContext(db), 'refresh capability supply readiness')

    await expect(reconcileRuntime(queryContext(db), {
      name: 'refresh capability supply readiness',
      snapshot,
    })).resolves.toMatchObject({
      actorPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
      activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
      principalRevision: 7,
      activeAccountRevision: 11,
    })

    const suspended = canonicalDb({ principalLifecycle: 'suspended' })
    await expect(reconcileRuntime(queryContext(suspended), {
      name: 'refresh capability supply readiness',
      snapshot,
    })).rejects.toMatchObject({ code: 'workload_principal_inactive' })
  })

  it('runs the registered scheduled probe through reconciliation and the bound action context without widening authority', async () => {
    const db = canonicalDb()
    const snapshot = await admitWorkloadCron(queryContext(db), 'refresh capability supply readiness')
    const queryRefs: string[] = []
    const runMutation = vi.fn()
    const ctx = {
      runQuery: vi.fn(async (reference: RuntimeReference, args: Record<string, unknown>) => {
        const name = getFunctionName(reference)
        queryRefs.push(name)
        if (name === 'workloadCron:reconcile') return await reconcileRuntime(queryContext(db), args)
        if (name === 'capabilitySupply:readCapabilityProbeTarget') {
          return { kind: 'unavailable', reason: 'publication_missing', evidenceRefs: [] }
        }
        throw new Error(`unexpected_runtime_query:${name}`)
      }),
      runMutation,
    }

    await expect(probeFromCronRuntime(ctx, {
      publicationRef: 'publication:runtime-sink',
      expectedRevision: 1,
      workload: snapshot,
    })).resolves.toEqual({
      kind: 'unavailable',
      reason: 'publication_missing',
      evidenceRefs: [],
    })
    expect(queryRefs).toEqual([
      'workloadCron:reconcile',
      'capabilitySupply:readCapabilityProbeTarget',
    ])
    expect(runMutation).not.toHaveBeenCalled()

    await expect(probeFromCronRuntime(ctx, {
      publicationRef: 'publication:runtime-sink',
      expectedRevision: 1,
      workload: { ...snapshot, activeAccountRef: 'acc_ffffffffffffffffffffffffffffffff' },
    })).rejects.toMatchObject({ code: 'workload_snapshot_invalid' })
    expect(queryRefs).toEqual([
      'workloadCron:reconcile',
      'capabilitySupply:readCapabilityProbeTarget',
    ])
    expect(runMutation).not.toHaveBeenCalled()
  })

  it('admits every declared job from current canonical membership facts', async () => {
    const db = canonicalDb()
    for (const [index, declaration] of WORKLOAD_CRON_DECLARATIONS.entries()) {
      const admission = index === 0
        ? admitWorkloadCronHandler(queryContext(db) as Parameters<typeof admitWorkloadCronHandler>[0], { name: declaration.name })
        : admitWorkloadCron(queryContext(db), declaration.name)
      await expect(admission).resolves.toMatchObject({
        workloadKind: declaration.workloadKind,
        actorPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
        activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
        principalRevision: 7,
        activeAccountRevision: 11,
        accessVia: 'membership',
        admittedAt: Date.now(),
      })
    }
  })

  it('admits the same exact Account through current canonical ownership', async () => {
    const db = canonicalDb({ workloadOwnsAccount: true, includeMembership: false })
    await expect(admitWorkloadCron(queryContext(db), 'refresh current market presence')).resolves.toMatchObject({
      accessVia: 'ownership',
      actorPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
      activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
    })
  })

  it('denies missing or ambiguous workload Principal facts', async () => {
    await expect(admitWorkloadCron(queryContext(new FakeDb()), 'continue market aggregate backfill'))
      .rejects.toMatchObject({ code: 'workload_principal_missing' })

    const ambiguous = canonicalDb()
    ambiguous.seed('principals', principal())
    await expect(admitWorkloadCron(queryContext(ambiguous), 'continue market aggregate backfill'))
      .rejects.toThrow('unique query returned more than one row')
  })

  it('denies a non-workload or inactive canonical Principal', async () => {
    const wrongKind = canonicalDb({ principalKind: 'agent' })
    await expect(admitWorkloadCron(queryContext(wrongKind), 'refresh facilitator discovery'))
      .rejects.toMatchObject({ code: 'workload_principal_kind_required' })

    const inactive = canonicalDb({ principalLifecycle: 'suspended' })
    await expect(admitWorkloadCron(queryContext(inactive), 'refresh facilitator discovery'))
      .rejects.toMatchObject({ code: 'workload_principal_inactive' })
  })

  it('denies missing, ambiguous, or inactive Account facts', async () => {
    const missing = canonicalDb({ includeAccount: false, includeOwnership: false, includeMembership: false })
    await expect(admitWorkloadCron(queryContext(missing), 'run daily supplier settlement'))
      .rejects.toMatchObject({ code: 'workload_account_missing' })

    const ambiguous = canonicalDb()
    ambiguous.seed('accounts', account())
    await expect(admitWorkloadCron(queryContext(ambiguous), 'run daily supplier settlement'))
      .rejects.toThrow('unique query returned more than one row')

    const inactive = canonicalDb({ accountLifecycle: 'suspended' })
    await expect(admitWorkloadCron(queryContext(inactive), 'run daily supplier settlement'))
      .rejects.toMatchObject({ code: 'workload_account_inactive' })
  })

  it('denies stale ownership and wrong-Account or ambiguous membership context', async () => {
    const staleOwnership = canonicalDb({ includeOwnership: false })
    await expect(admitWorkloadCron(queryContext(staleOwnership), 'refresh capability supply readiness'))
      .rejects.toMatchObject({ code: 'workload_record_integrity_invalid' })

    const wrongAccount = canonicalDb({ includeMembership: false })
    wrongAccount.seed('memberships', membership({ accountRef: 'acc_ffffffffffffffffffffffffffffffff' }))
    await expect(admitWorkloadCron(queryContext(wrongAccount), 'refresh capability supply readiness'))
      .rejects.toMatchObject({ code: 'workload_account_access_forbidden' })

    const ambiguousMembership = canonicalDb()
    ambiguousMembership.seed('memberships', membership())
    await expect(admitWorkloadCron(queryContext(ambiguousMembership), 'refresh capability supply readiness'))
      .rejects.toThrow('unique query returned more than one row')
  })

  it('checks current workload authority before dispatch across all ten wrappers', async () => {
    const context = new FakeRuntimeContext(canonicalDb())
    for (const handler of ACTION_HANDLERS) await expect(handler(context.action())).resolves.toBeNull()
    for (const handler of MUTATION_HANDLERS) await expect(handler(context.mutation())).resolves.toBeNull()

    expect(context.admissions).toEqual(WORKLOAD_CRON_DECLARATIONS.slice(0, 4).map(({ name }) => name))
    expect(context.dispatches).toHaveLength(10)
    expect(context.db.queries).toEqual(Array.from({ length: 10 }, () => [
      'principals',
      'accounts',
      'accountOwnerships',
      'memberships',
    ]).flat())
    expect(context.trace.every(([admission, dispatch]) => admission < dispatch)).toBe(true)
  })

  it('denies missing workload facts before dispatch', async () => {
    const context = new FakeRuntimeContext(new FakeDb())
    await expect(reconcileDueFacilitatorInvocationsHandler(context.action()))
      .rejects.toMatchObject({ code: 'workload_principal_missing' })
    await expect(runDailySupplierSettlementHandler(context.mutation()))
      .rejects.toMatchObject({ code: 'workload_principal_missing' })
    expect(context.dispatches).toEqual([])
  })

  it('preserves an unknown external target outcome instead of translating or retrying it', async () => {
    const uncertain = new Error('external_outcome_unknown')
    const context = new FakeRuntimeContext(canonicalDb(), uncertain)
    await expect(refreshFacilitatorDiscoveryHandler(context.action())).rejects.toBe(uncertain)
    expect(context.dispatches).toEqual(['facilitatorDiscoveryAction:run'])
  })

  it('rejects forged, malformed, or future workload snapshots before rereading authority', async () => {
    const db = canonicalDb()
    const snapshot = await admitWorkloadCron(queryContext(db), 'refresh facilitator discovery')
    const invalid: WorkloadCronSnapshot[] = [
      { ...snapshot, name: 'refresh current market presence' },
      { ...snapshot, workloadKind: 'job' },
      { ...snapshot, actorPrincipalRef: 'prn_ffffffffffffffffffffffffffffffff' as WorkloadCronSnapshot['actorPrincipalRef'] },
      { ...snapshot, activeAccountRef: 'acc_ffffffffffffffffffffffffffffffff' as WorkloadCronSnapshot['activeAccountRef'] },
      { ...snapshot, purpose: 'forged purpose' },
      { ...snapshot, source: 'forged/source' },
      { ...snapshot, admittedAt: 1.5 },
      { ...snapshot, admittedAt: Date.now() + 1 },
    ]
    for (const candidate of invalid) {
      await expect(reconcileWorkloadCronSnapshot(
        queryContext(db),
        'refresh facilitator discovery',
        candidate,
      )).rejects.toMatchObject({ code: 'workload_snapshot_invalid' })
    }
    await expect(reconcileWorkloadCronSnapshotHandler(
      queryContext(db) as Parameters<typeof reconcileWorkloadCronSnapshotHandler>[0],
      { name: 'refresh facilitator discovery', snapshot },
    )).resolves.toMatchObject({ name: 'refresh facilitator discovery' })
  })

  it('parses the hostile validator boundary into branded immutable refs and rejects malformed shapes', async () => {
    const snapshot = await admitWorkloadCron(queryContext(canonicalDb()), 'refresh facilitator discovery')
    expect(parseWorkloadCronSnapshot({ ...snapshot })).toEqual(snapshot)
    expect(Object.isFrozen(parseWorkloadCronSnapshot({ ...snapshot }))).toBe(true)
    const invalid: unknown[] = [
      null,
      [],
      { ...snapshot, extra: true },
      Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'source')),
      { ...snapshot, name: 'not-declared' },
      { ...snapshot, principalRevision: 0 },
      { ...snapshot, correlationRef: 'bad correlation ref' },
    ]
    for (const candidate of invalid) {
      expect(() => parseWorkloadCronSnapshot(candidate)).toThrow('workload_snapshot_invalid')
    }
  })

  it('reconciles same-Account and explicit cross-Account payout attribution from canonical account facts', async () => {
    const db = canonicalDb()
    const snapshot = await admitWorkloadCron(queryContext(db), 'run daily supplier settlement')
    await expect(reconcileWorkloadCronResourceAccount(
      queryContext(db),
      snapshot.name,
      snapshot,
      PHASE_2_CRON_ACCOUNT_REF,
    )).resolves.toMatchObject({ activeAccountRef: PHASE_2_CRON_ACCOUNT_REF })
    const resourceAccountRef = 'acc_dddddddddddddddddddddddddddddddd'
    db.seed('accounts', { ...account(), accountRef: resourceAccountRef })
    await expect(reconcileWorkloadCronResourceAccount(
      queryContext(db),
      snapshot.name,
      snapshot,
      resourceAccountRef,
    )).resolves.toMatchObject({ activeAccountRef: PHASE_2_CRON_ACCOUNT_REF })
  })

  it('binds reconciliation resources only through a current full-chain grant admission and dual Account attribution', async () => {
    const db = canonicalDb()
    const snapshot = await admitWorkloadCron(queryContext(db), 'reconcile due facilitator invocations')
    const missing = new FakeRuntimeContext(db)
    await expect(dispatchWorkloadCronConsequenceHandler(missing.mutation() as never, {
      name: snapshot.name,
      snapshot,
      resourceInvocationRef: 'inv_missing',
      operation: 'facilitatorDiscovery:reconcile',
      payload: {},
    })).rejects.toMatchObject({ code: 'workload_resource_authority_invalid' })

    seedInvocationAuthority(db, { grantAccountRef: PHASE_2_CRON_ACCOUNT_REF })
    const sameAccount = new FakeRuntimeContext(db)
    await expect(dispatchWorkloadCronConsequenceHandler(sameAccount.mutation() as never, {
      name: snapshot.name,
      snapshot,
      resourceInvocationRef: 'inv_cron',
      operation: 'facilitatorDiscovery:reconcile',
      payload: {},
    })).resolves.toBeNull()

    const crossDb = canonicalDb()
    seedInvocationAuthority(crossDb, { grantAccountRef: 'acc_dddddddddddddddddddddddddddddddd' })
    const crossAccount = new FakeRuntimeContext(crossDb)
    await expect(dispatchWorkloadCronConsequenceHandler(crossAccount.mutation() as never, {
      name: snapshot.name,
      snapshot,
      resourceInvocationRef: 'inv_cron',
      operation: 'facilitatorDiscovery:reconcile',
      payload: {},
    })).resolves.toBeNull()
  })

  it('denies missing, inactive, stale-generation, expired, revoked-ancestor, and malformed resource chains', async () => {
    const cases = [
      { includeGrant: false },
      { leafLifecycle: 'revoked' as const },
      { grantGeneration: 8 },
      { grantExpiresAt: Date.now() },
      { rootLifecycle: 'revoked' as const },
      { malformedChain: true },
      { invocationPrincipalRef: 'prn_ffffffffffffffffffffffffffffffff' },
      { invocationAccountRef: 'acc_ffffffffffffffffffffffffffffffff' },
      { invocationGrantExpiresAt: Date.now() + 1 },
      { invocationOperationRef: 'operation:not-delegated' },
    ]
    for (const input of cases) {
      const db = canonicalDb()
      seedInvocationAuthority(db, input)
      const snapshot = await admitWorkloadCron(queryContext(db), 'reconcile due facilitator invocations')
      const context = new FakeRuntimeContext(db)
      await expect(dispatchWorkloadCronConsequenceHandler(context.mutation() as never, {
        name: snapshot.name,
        snapshot,
        resourceInvocationRef: 'inv_cron',
        operation: 'facilitatorDiscovery:reconcile',
        payload: {},
      })).rejects.toMatchObject({ code: 'workload_resource_authority_invalid' })
      expect(context.dispatches).toEqual([])
    }
  })

  it('fails closed on inconsistent admitted snapshots while preserving unexpected store failures', async () => {
    const db = canonicalDb()
    seedInvocationAuthority(db)
    const snapshot = await admitWorkloadCron(queryContext(db), 'reconcile due facilitator invocations')
    const context = new FakeRuntimeContext(db)
    vi.spyOn(DelegationService.prototype, 'admitConsequence').mockResolvedValueOnce({
      grantRef: 'grt_ffffffffffffffffffffffffffffffff',
      generation: 7,
      accountRef: 'acc_dddddddddddddddddddddddddddddddd',
      actorPrincipalRef: 'prn_cccccccccccccccccccccccccccccccc',
      expiresAt: Date.now() + 1,
    } as never)
    await expect(dispatchWorkloadCronConsequenceHandler(context.mutation() as never, {
      name: snapshot.name,
      snapshot,
      resourceInvocationRef: 'inv_cron',
      operation: 'facilitatorDiscovery:reconcile',
      payload: {},
    })).rejects.toMatchObject({ code: 'workload_resource_authority_invalid' })

    const unexpected = new Error('store_unavailable')
    vi.spyOn(DelegationService.prototype, 'admitConsequence').mockRejectedValueOnce(unexpected)
    await expect(dispatchWorkloadCronConsequenceHandler(context.mutation() as never, {
      name: snapshot.name,
      snapshot,
      resourceInvocationRef: 'inv_cron',
      operation: 'facilitatorDiscovery:reconcile',
      payload: {},
    })).rejects.toBe(unexpected)
  })

  it('routes every declared mutation consequence through same-transaction current admission', async () => {
    const operations = [
      'capabilityOperationInvocations:cancelBeforeClaim',
      'capabilityOperationInvocations:claimAutomaticReconciliationCandidate',
      'capabilityOperationInvocations:finishAutomaticReconciliation',
      'capabilityOperationX402AuthorizationExpiry:queueExpiredX402Authorization',
      'capabilitySupply:recordCapabilityProbeResult',
      'facilitatorDiscovery:reconcile',
      'marketExternalRegistry:begin',
      'marketExternalRegistry:fail',
      'marketExternalRegistry:finalize',
      'marketExternalRegistry:writeBatch',
      'marketExternalSnapshots:upsert',
      'moneyLedger:reconcileExternalInvocationSpend',
      'moneyX402PaymentAttempts:reconcileX402PaymentAttempt',
    ] as const
    const context = new FakeRuntimeContext(canonicalDb())
    const snapshot = await admitWorkloadCron(queryContext(context.db), 'refresh facilitator discovery')
    for (const operation of operations) {
      await expect(dispatchWorkloadCronConsequenceHandler(
        context.mutation() as Parameters<typeof dispatchWorkloadCronConsequenceHandler>[0],
        {
          name: 'refresh facilitator discovery',
          snapshot,
          operation,
          payload: { marker: operation },
        },
      )).resolves.toBeNull()
    }
    expect(context.dispatches).toEqual(operations)
  })

  it('rejects undeclared mutation consequences before the proxy dispatches', async () => {
    const context = new FakeRuntimeContext(canonicalDb())
    const snapshot = await admitWorkloadCron(queryContext(context.db), 'refresh facilitator discovery')
    const bound = bindWorkloadCronActionContext(context.action() as never, {
      name: 'refresh facilitator discovery',
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
    const snapshot = await admitWorkloadCron(queryContext(context.db), 'refresh facilitator discovery')
    const declared = makeFunctionReference<'mutation'>('facilitatorDiscovery:reconcile') as unknown as FunctionReference<'mutation', 'internal'>
    const unscoped = bindWorkloadCronActionContext(context.action() as never, {
      name: 'refresh facilitator discovery',
      snapshot,
    })
    await expect(Reflect.apply(unscoped.runMutation, unscoped, [declared])).resolves.toBeNull()

    const scoped = bindWorkloadCronActionContext(context.action() as never, {
      name: 'refresh facilitator discovery',
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

type Row = Record<string, unknown>
type Filter = Readonly<{ field: string; value: unknown }>

class FakeIndexBuilder {
  readonly filters: Filter[] = []

  eq(field: string, value: unknown): this {
    this.filters.push({ field, value })
    return this
  }
}

class FakeQuery {
  constructor(
    private readonly rows: readonly Row[],
    private readonly filters: readonly Filter[] = [],
  ) {}

  withIndex(_indexName: string, callback: (query: FakeIndexBuilder) => FakeIndexBuilder): FakeQuery {
    const builder = callback(new FakeIndexBuilder())
    return new FakeQuery(this.rows, [...this.filters, ...builder.filters])
  }

  async unique(): Promise<Row | null> {
    const matches = this.matches()
    if (matches.length > 1) throw new Error('unique query returned more than one row')
    return matches.at(0) ?? null
  }

  async collect(): Promise<Row[]> {
    return this.matches()
  }

  private matches(): Row[] {
    return this.rows.filter((row) => this.filters.every(({ field, value }) => (
      field.split('.').reduce<unknown>((current, segment) => (
        typeof current === 'object' && current !== null ? (current as Row)[segment] : undefined
      ), row) === value
    )))
  }
}

class FakeDb {
  readonly #tables = new Map<string, Row[]>()
  readonly queries: string[] = []
  #nextId = 1

  query(tableName: string): FakeQuery {
    this.queries.push(tableName)
    return new FakeQuery(this.#tables.get(tableName) ?? [])
  }

  seed(tableName: string, row: Row): void {
    const rows = this.#tables.get(tableName) ?? []
    rows.push({ _id: `${tableName}:${this.#nextId++}`, _creationTime: Date.now(), ...row })
    this.#tables.set(tableName, rows)
  }

  async insert(tableName: string, row: Row): Promise<string> {
    const id = `${tableName}:${this.#nextId++}`
    const rows = this.#tables.get(tableName) ?? []
    rows.push({ _id: id, _creationTime: Date.now(), ...row })
    this.#tables.set(tableName, rows)
    return id
  }

  async replace(id: string, row: Row): Promise<void> {
    for (const rows of this.#tables.values()) {
      const index = rows.findIndex((candidate) => candidate._id === id)
      if (index !== -1) {
        rows[index] = { _id: id, _creationTime: rows[index]?._creationTime ?? Date.now(), ...row }
        return
      }
    }
    throw new Error(`missing fake row ${id}`)
  }
}

function queryContext(db: FakeDb) {
  return { db } as unknown as Parameters<typeof admitWorkloadCron>[0]
}

type CanonicalDbOptions = Readonly<{
  accountLifecycle?: 'active' | 'suspended'
  includeAccount?: boolean
  includeMembership?: boolean
  includeOwnership?: boolean
  principalKind?: 'agent' | 'workload'
  principalLifecycle?: 'active' | 'suspended'
  workloadOwnsAccount?: boolean
}>

function canonicalDb(options: CanonicalDbOptions = {}): FakeDb {
  const db = new FakeDb()
  db.seed('principals', principal({
    ...(options.principalKind === undefined ? {} : { kind: options.principalKind }),
    ...(options.principalLifecycle === undefined ? {} : { lifecycle: options.principalLifecycle }),
  }))
  if (options.includeAccount !== false) db.seed('accounts', account(
    options.accountLifecycle === undefined ? {} : { lifecycle: options.accountLifecycle },
  ))
  if (options.includeOwnership !== false) db.seed('accountOwnerships', ownership(
    options.workloadOwnsAccount === undefined ? {} : { workloadOwnsAccount: options.workloadOwnsAccount },
  ))
  if (options.includeMembership !== false) db.seed('memberships', membership())
  return db
}

function principal(input: Readonly<{ kind?: string; lifecycle?: string }> = {}): Row {
  return {
    principalRef: PHASE_2_CRON_PRINCIPAL_REF,
    kind: input.kind ?? 'workload',
    displayName: 'Phase 2 scheduled workload',
    lifecycle: input.lifecycle ?? 'active',
    revision: 7,
    createdAt: 1,
    updatedAt: 2,
  }
}

function account(input: Readonly<{ lifecycle?: string }> = {}): Row {
  return {
    accountRef: PHASE_2_CRON_ACCOUNT_REF,
    displayName: 'Phase 2 operations',
    lifecycle: input.lifecycle ?? 'active',
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    creationIdempotencyRef: 'account:create',
    initialOwnershipRef: 'own_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    currentOwnershipRef: 'own_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    revision: 11,
    createdAt: 1,
    updatedAt: 2,
    lastAction: {
      actorPrincipalRef: 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
      correlationRef: 'account:create',
      idempotencyRef: 'account:create',
    },
  }
}

function ownership(input: Readonly<{ workloadOwnsAccount?: boolean }> = {}): Row {
  return {
    ownershipRef: 'own_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    accountRef: PHASE_2_CRON_ACCOUNT_REF,
    ownerPrincipalRef: input.workloadOwnsAccount === true
      ? PHASE_2_CRON_PRINCIPAL_REF
      : 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
      correlationRef: 'account:create',
      idempotencyRef: 'account:create',
    },
  }
}

function membership(input: Readonly<{ accountRef?: string }> = {}): Row {
  return {
    membershipRef: 'mem_cccccccccccccccccccccccccccccccc',
    accountRef: input.accountRef ?? PHASE_2_CRON_ACCOUNT_REF,
    memberPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      activeAccountRef: input.accountRef ?? PHASE_2_CRON_ACCOUNT_REF,
      correlationRef: 'membership:create',
      idempotencyRef: 'membership:create',
    },
  }
}

function seedInvocationAuthority(
  db: FakeDb,
  input: Readonly<{
    includeGrant?: boolean
    grantAccountRef?: string
    grantExpiresAt?: number
    grantGeneration?: number
    invocationAccountRef?: string
    invocationGrantExpiresAt?: number
    invocationOperationRef?: string
    invocationPrincipalRef?: string
    leafLifecycle?: 'active' | 'revoked'
    malformedChain?: boolean
    rootLifecycle?: 'active' | 'revoked'
  }> = {},
): void {
  const resourceAccountRef = input.grantAccountRef ?? 'acc_dddddddddddddddddddddddddddddddd'
  const rootGrantRef = 'grt_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  const leafGrantRef = 'grt_dddddddddddddddddddddddddddddddd'
  const rootActor = 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const intermediate = 'prn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const leafSubject = 'prn_cccccccccccccccccccccccccccccccc'
  db.seed('capabilityOperationInvocations', {
    invocationRef: 'inv_cron',
    principalId: input.invocationPrincipalRef ?? leafSubject,
    ownerId: input.invocationAccountRef ?? resourceAccountRef,
    operationRef: input.invocationOperationRef ?? 'invocation:inv_cron',
    grantRef: leafGrantRef,
    grantGeneration: 7,
    grantExpiresAt: input.invocationGrantExpiresAt ?? (input.grantExpiresAt ?? Date.now() + 60_000),
  })
  if (input.includeGrant !== false) {
    db.seed('authorityDelegationGrants', {
      grantRef: rootGrantRef,
      accountRef: resourceAccountRef,
      actorPrincipalRef: rootActor,
      subjectPrincipalRef: intermediate,
      scopes: ['operation:reconcile'],
      resourceRefs: ['invocation:inv_cron'],
      budgetLimit: 10,
      budgetUsed: 0,
      expiresAt: Date.now() + 120_000,
      generation: input.rootLifecycle === 'revoked' ? 2 : 1,
      revision: input.rootLifecycle === 'revoked' ? 2 : 1,
      lifecycle: input.rootLifecycle ?? 'active',
      createdAt: 1,
      createdBy: actionContext(rootActor, resourceAccountRef, 'root'),
      ...(input.rootLifecycle === 'revoked'
        ? { revokedAt: 2, revokedBy: actionContext(rootActor, resourceAccountRef, 'revoke-root') }
        : {}),
    })
    db.seed('authorityDelegationGrants', {
      grantRef: leafGrantRef,
      accountRef: resourceAccountRef,
      actorPrincipalRef: input.malformedChain === true ? rootActor : intermediate,
      subjectPrincipalRef: leafSubject,
      parentGrantRef: rootGrantRef,
      parentGeneration: input.rootLifecycle === 'revoked' ? 1 : 1,
      scopes: ['operation:reconcile'],
      resourceRefs: ['invocation:inv_cron'],
      budgetLimit: 5,
      budgetUsed: 0,
      expiresAt: input.grantExpiresAt ?? Date.now() + 60_000,
      generation: input.leafLifecycle === 'revoked' ? 8 : (input.grantGeneration ?? 7),
      revision: input.leafLifecycle === 'revoked' ? 8 : (input.grantGeneration ?? 7),
      lifecycle: input.leafLifecycle ?? 'active',
      createdAt: 2,
      createdBy: actionContext(
        input.malformedChain === true ? rootActor : intermediate,
        resourceAccountRef,
        'leaf',
      ),
      ...(input.leafLifecycle === 'revoked'
        ? { revokedAt: 3, revokedBy: actionContext(leafSubject, resourceAccountRef, 'revoke-leaf') }
        : {}),
    })
  }
  db.seed('principals', {
    principalRef: leafSubject,
    kind: 'agent',
    displayName: 'Invocation authority subject',
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  })
  if (resourceAccountRef !== PHASE_2_CRON_ACCOUNT_REF) {
    db.seed('accounts', {
      ...account(),
      accountRef: resourceAccountRef,
      initialOwnershipRef: 'own_dddddddddddddddddddddddddddddddd',
      currentOwnershipRef: 'own_dddddddddddddddddddddddddddddddd',
    })
    db.seed('accountOwnerships', {
      ...ownership(),
      ownershipRef: 'own_dddddddddddddddddddddddddddddddd',
      accountRef: resourceAccountRef,
    })
  }
  db.seed('memberships', {
    ...membership({ accountRef: resourceAccountRef }),
    membershipRef: 'mem_dddddddddddddddddddddddddddddddd',
    memberPrincipalRef: leafSubject,
  })
}

function actionContext(actorPrincipalRef: string, activeAccountRef: string, suffix: string): Row {
  return {
    actorPrincipalRef,
    activeAccountRef,
    correlationRef: `cron-test:${suffix}`,
    idempotencyRef: `cron-test:${suffix}`,
  }
}

type RuntimeReference = FunctionReference<'query' | 'mutation' | 'action', 'public' | 'internal'>

class FakeRuntimeContext {
  readonly admissions: string[] = []
  readonly dispatches: string[] = []
  readonly events: string[] = []
  readonly #tracePairs: Array<[number, number]> = []

  constructor(
    readonly db: FakeDb,
    readonly targetError?: Error,
  ) {}

  get trace(): readonly [number, number][] {
    return this.#tracePairs
  }

  action(): WorkloadCronActionContext {
    return {
      runQuery: async (_reference, args) => {
        const admittedAt = this.recordAdmission(args.name)
        const result = await admitWorkloadCron(queryContext(this.db), args.name)
        this.#tracePairs.push([admittedAt, -1])
        return result
      },
      runMutation: async (reference: FunctionReference<'mutation', 'public' | 'internal'>) => this.recordDispatch(reference),
      runAction: async (reference: FunctionReference<'action', 'public' | 'internal'>) => this.recordDispatch(reference),
    } as WorkloadCronActionContext
  }

  mutation(): WorkloadCronMutationContext {
    return {
      db: this.db,
      runMutation: async (reference: FunctionReference<'mutation', 'public' | 'internal'>) => this.recordDispatch(reference),
    } as unknown as WorkloadCronMutationContext
  }

  recordAdmission(name: string): number {
    this.admissions.push(name)
    this.events.push(`admit:${name}`)
    return this.events.length - 1
  }

  private async recordDispatch(reference: RuntimeReference): Promise<null> {
    const name = getFunctionName(reference)
    this.dispatches.push(name)
    this.events.push(`dispatch:${name}`)
    const openPair = this.#tracePairs.find(([, dispatch]) => dispatch === -1)
    if (openPair !== undefined) openPair[1] = this.events.length - 1
    if (this.targetError !== undefined) throw this.targetError
    return null
  }
}
