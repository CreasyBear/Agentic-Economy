import { getFunctionName, type FunctionReference } from 'convex/server'
import { expect, vi } from 'vitest'

import { probeFromCron } from '../../../convex/capabilitySupplyReadiness'
import { readPreClaimRefundHandler } from '../../../convex/lib/callLifecycle/dispatch'
import {
  SYSTEM_WORKLOAD_ACCOUNT_REF,
  SYSTEM_WORKLOAD_PRINCIPAL_REF,
  parseWorkloadCronSnapshot,
  type WorkloadCronActionContext,
  type WorkloadCronMutationContext,
  type WorkloadCronSnapshot,
} from '../../../convex/lib/workloadCron/context'
import {
  admitWorkloadCron,
  reconcileWorkloadCronResourceAccount,
  reconcileWorkloadCronSnapshot,
} from '../../../convex/lib/workloadCron/admission'
import { dispatchWorkloadCronConsequenceHandler } from '../../../convex/lib/workloadCron/consequence'
import { reconcile, refreshCapabilitySupplyReadiness } from '../../../convex/workloadCron'

export type RegisteredRuntimeHandler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>

export const refreshCapabilitySupplyReadinessRuntime = (
  refreshCapabilitySupplyReadiness as unknown as { _handler: RegisteredRuntimeHandler }
)._handler
export const reconcileRuntime = (reconcile as unknown as { _handler: RegisteredRuntimeHandler })._handler
export const probeFromCronRuntime = (probeFromCron as unknown as { _handler: RegisteredRuntimeHandler })._handler

export type WorkloadCronName = WorkloadCronSnapshot['name']

export const CRON_READINESS = 'refresh capability supply readiness' as const
export const CRON_FACILITATOR = 'refresh facilitator discovery' as const
export const CRON_MARKET = 'refresh current market presence' as const
export const CRON_OAUTH = 'cleanup expired agent access oauth grants' as const
export const CRON_FACILITATOR_INVOCATIONS = 'reconcile due facilitator invocations' as const

export const CANONICAL_WORKLOAD = {
  actorPrincipalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
  activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
} as const

export const CANONICAL_ADMISSION = {
  ...CANONICAL_WORKLOAD,
  principalRevision: 7,
  activeAccountRevision: 11,
} as const

export const WORKLOAD_AUTHORITY_QUERY_CHAIN = [
  'principals',
  'accounts',
  'accountOwnerships',
  'memberships',
] as const

export const PROBE_UNAVAILABLE = {
  kind: 'unavailable',
  reason: 'publication_missing',
  evidenceRefs: [],
} as const

export type RuntimeReference = FunctionReference<'query' | 'mutation' | 'action', 'public' | 'internal'>

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

  async take(limit: number): Promise<Row[]> {
    return this.matches().slice(0, limit)
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

export class FakeDb {
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

export type CanonicalDbOptions = Readonly<{
  accountLifecycle?: 'active' | 'suspended'
  includeAccount?: boolean
  includeMembership?: boolean
  includeOwnership?: boolean
  principalKind?: 'agent' | 'workload'
  principalLifecycle?: 'active' | 'suspended'
  workloadOwnsAccount?: boolean
}>

export function queryContext(db: FakeDb) {
  return { db } as unknown as Parameters<typeof admitWorkloadCron>[0]
}

export function canonicalDb(options: CanonicalDbOptions = {}): FakeDb {
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

export function principal(input: Readonly<{ kind?: string; lifecycle?: string }> = {}): Row {
  return {
    principalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
    kind: input.kind ?? 'workload',
    displayName: 'System scheduled workload',
    lifecycle: input.lifecycle ?? 'active',
    revision: 7,
    createdAt: 1,
    updatedAt: 2,
  }
}

export function account(input: Readonly<{ lifecycle?: string }> = {}): Row {
  return {
    accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    displayName: 'System operations',
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
      activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      correlationRef: 'account:create',
      idempotencyRef: 'account:create',
    },
  }
}

function ownership(input: Readonly<{ workloadOwnsAccount?: boolean }> = {}): Row {
  return {
    ownershipRef: 'own_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    ownerPrincipalRef: input.workloadOwnsAccount === true
      ? SYSTEM_WORKLOAD_PRINCIPAL_REF
      : 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      correlationRef: 'account:create',
      idempotencyRef: 'account:create',
    },
  }
}

export function membership(input: Readonly<{ accountRef?: string }> = {}): Row {
  return {
    membershipRef: 'mem_cccccccccccccccccccccccccccccccc',
    accountRef: input.accountRef ?? SYSTEM_WORKLOAD_ACCOUNT_REF,
    memberPrincipalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      activeAccountRef: input.accountRef ?? SYSTEM_WORKLOAD_ACCOUNT_REF,
      correlationRef: 'membership:create',
      idempotencyRef: 'membership:create',
    },
  }
}

export function seedInvocationAuthority(
  db: FakeDb,
  input: Readonly<{
    includeGrant?: boolean
    grantAccountRef?: string
    grantExpiresAt?: number
    grantGeneration?: number
    accessGrantGeneration?: number
    wildcard?: boolean
    preClaimRefund?: boolean
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
  db.seed('capabilityCalls', {
    callRef: 'inv_cron',
    principalId: input.invocationPrincipalRef ?? leafSubject,
    ownerId: input.invocationAccountRef ?? resourceAccountRef,
    toolRef: input.invocationOperationRef ?? 'invocation:inv_cron',
    grantRef: leafGrantRef,
    grantGeneration: 7,
    credentialId: 'credential:cron',
    applicationRef: 'application:cron',
    environment: 'sandbox',
    policyDigest: 'sha256:cron-policy',
    ...(input.preClaimRefund ? {
      state: 'refused', result: { kind: 'refused', code: 'budget_exceeded' },
      dispatchState: 'failed', reconciliation: { reason: 'refund_pending' },
      formanceFinancialState: 'reserved', formanceReservationRefs: ['buyer', 'treasury', 'provider'],
    } : {}),
    grantExpiresAt: input.invocationGrantExpiresAt ?? (input.grantExpiresAt ?? Date.now() + 60_000),
  })
  db.seed('agentAccessGrants', {
    grantRef: leafGrantRef, principalId: leafSubject, ownerId: resourceAccountRef,
    credentialId: 'credential:cron', applicationRef: 'application:cron', environment: 'sandbox',
    generation: input.accessGrantGeneration ?? 7, spendingPolicyDigest: 'sha256:cron-policy',
    expiresAt: input.grantExpiresAt ?? Date.now() + 60_000,
  })
  if (input.includeGrant !== false) {
    db.seed('authorityDelegationGrants', {
      grantRef: rootGrantRef,
      accountRef: resourceAccountRef,
      actorPrincipalRef: rootActor,
      subjectPrincipalRef: intermediate,
      scopes: ['operation:reconcile'],
      resourceRefs: input.wildcard ? ['*'] : ['invocation:inv_cron'],
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
      resourceRefs: input.wildcard ? ['*'] : ['invocation:inv_cron'],
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
  if (resourceAccountRef !== SYSTEM_WORKLOAD_ACCOUNT_REF) {
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

export class FakeRuntimeContext {
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
      runQuery: async (reference: RuntimeReference, args: { callRef: string }) => {
        if (getFunctionName(reference) !== 'capabilityCalls:readPreClaimRefund') throw new Error('unexpected_refund_query')
        return await readPreClaimRefundHandler({ db: this.db } as never, args)
      },
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

export async function admitCron(db: FakeDb, name: WorkloadCronName) {
  return admitWorkloadCron(queryContext(db), name)
}

type DispatchConsequenceOverrides = Partial<{
  name: WorkloadCronName
  resourceInvocationRef: string
  operation: string
  payload: Record<string, unknown>
}>

export function dispatchConsequenceArgs(
  snapshot: WorkloadCronSnapshot,
  overrides: DispatchConsequenceOverrides = {},
) {
  return {
    name: snapshot.name,
    snapshot,
    operation: 'facilitatorDiscovery:reconcile',
    payload: {},
    ...overrides,
  }
}

export function dispatchConsequence(
  context: FakeRuntimeContext,
  snapshot: WorkloadCronSnapshot,
  overrides?: DispatchConsequenceOverrides,
) {
  return dispatchWorkloadCronConsequenceHandler(
    context.mutation() as never,
    dispatchConsequenceArgs(snapshot, { resourceInvocationRef: 'inv_cron', ...overrides }) as never,
  )
}

export function reconcileWorkload(
  db: FakeDb,
  name: WorkloadCronName,
  snapshot: WorkloadCronSnapshot,
) {
  return reconcileRuntime(queryContext(db), { name, snapshot })
}

export function createScheduledProbeHarness(db: FakeDb) {
  const queryRefs: string[] = []
  const targetArgs: Record<string, unknown>[] = []
  const runMutation = vi.fn()
  const ctx = {
    runQuery: vi.fn(async (reference: RuntimeReference, args: Record<string, unknown>) => {
      const name = getFunctionName(reference)
      queryRefs.push(name)
      if (name === 'workloadCron:reconcile') return await reconcileRuntime(queryContext(db), args)
      if (name === 'capabilitySupply:readCapabilityProbeTarget') {
        targetArgs.push(args)
        return PROBE_UNAVAILABLE
      }
      throw new Error(`unexpected_runtime_query:${name}`)
    }),
    runMutation,
  }
  return {
    ctx,
    queryRefs,
    targetArgs,
    runMutation,
    runProbe: (args: Record<string, unknown>) => probeFromCronRuntime(ctx, args),
  }
}

export function createIsolationProbeAction(db: FakeDb, targetReads: string[], runMutation: ReturnType<typeof vi.fn>) {
  return {
    runQuery: vi.fn(async (reference: RuntimeReference, args: Record<string, unknown>) => {
      const name = getFunctionName(reference)
      if (name === 'workloadCron:reconcile') return await reconcileRuntime(queryContext(db), args)
      targetReads.push(name)
      return PROBE_UNAVAILABLE
    }),
    runMutation,
  }
}

export async function assertWorkloadIsolationScenario(options: {
  allowed: boolean
  makeDb: () => FakeDb
  present: (value: WorkloadCronSnapshot) => WorkloadCronSnapshot
}): Promise<void> {
  const { allowed, makeDb, present } = options
  const admitted = await admitCron(canonicalDb(), CRON_READINESS)
  const snapshot = present(admitted)
  const db = makeDb()
  const admission = new FakeRuntimeContext(db)
  const targetReads: string[] = []
  const runMutation = vi.fn()
  const action = createIsolationProbeAction(db, targetReads, runMutation)
  const probeArgs = {
    publicationRef: 'publication:isolation-matrix',
    expectedRevision: 1,
    workload: snapshot,
  }

  if (allowed) {
    await expect(refreshCapabilitySupplyReadinessRuntime(admission.mutation(), {})).resolves.toBeNull()
    expect(admission.dispatches).toEqual(['capabilitySupply:scheduleDueCapabilityProbes'])
    await expect(reconcileWorkload(db, snapshot.name, snapshot)).resolves.toMatchObject(CANONICAL_WORKLOAD)
    await expect(probeFromCronRuntime(action, probeArgs)).resolves.toMatchObject({ kind: 'unavailable' })
    expect(targetReads).toEqual(['capabilitySupply:readCapabilityProbeTarget'])
  } else {
    await expect(refreshCapabilitySupplyReadinessRuntime(admission.mutation(), {})).rejects.toThrow()
    expect(admission.dispatches).toEqual([])
    await expect(reconcileWorkload(db, snapshot.name, snapshot)).rejects.toThrow()
    await expect(probeFromCronRuntime(action, probeArgs)).rejects.toThrow()
    expect(targetReads).toEqual([])
  }
  expect(runMutation).not.toHaveBeenCalled()
}

export async function expectReconcileSnapshotRejects(
  patch: (snapshot: WorkloadCronSnapshot) => WorkloadCronSnapshot,
  cronName: WorkloadCronName = CRON_FACILITATOR,
): Promise<void> {
  const db = canonicalDb()
  const snapshot = await admitCron(db, cronName)
  await expect(reconcileWorkloadCronSnapshot(queryContext(db), cronName, patch(snapshot)))
    .rejects.toMatchObject({ code: 'workload_snapshot_invalid' })
}

export async function expectParseSnapshotRejects(
  invalid: (snapshot: WorkloadCronSnapshot) => unknown,
): Promise<void> {
  const snapshot = await admitCron(canonicalDb(), CRON_FACILITATOR)
  expect(() => parseWorkloadCronSnapshot(invalid(snapshot))).toThrow('workload_snapshot_invalid')
}

export async function expectResourceAccountReconciliation(
  db: FakeDb,
  snapshot: WorkloadCronSnapshot,
  resourceAccountRef: string,
): Promise<void> {
  await expect(reconcileWorkloadCronResourceAccount(
    queryContext(db),
    snapshot.name,
    snapshot,
    resourceAccountRef,
  )).resolves.toMatchObject({ activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF })
}
