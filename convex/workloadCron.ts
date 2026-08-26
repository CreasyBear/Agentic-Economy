import {
  getFunctionName,
  type DefaultFunctionArgs,
  type FunctionReference,
} from 'convex/server'
import { v, type Validator } from 'convex/values'

import type { JsonValue } from '@/modules/capability-contract/public'
import {
  accountRef,
  createWorkloadContext,
  membershipRef,
  ownershipRef,
  principalRef,
  WorkloadContextAdmission,
  type AdmittedWorkloadContext,
  type Account,
  type AccountActionContext,
  type AccountOwnership,
  type AccountRef,
  type Membership,
  type Principal,
  type PrincipalRef,
  type WorkloadContextStore,
  type WorkloadKind,
} from '@/modules/principal-account/public'
import {
  DelegationError,
  DelegationService,
  delegationGrantRef,
} from '@/modules/authority/delegation/public'

import { internal } from './_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './lib/delegationPersistence'
import type { Doc } from './_generated/dataModel'

export const PHASE_2_CRON_PRINCIPAL_REF = 'prn_f2000000000000000000000000000001' as PrincipalRef
export const PHASE_2_CRON_ACCOUNT_REF = 'acc_f2000000000000000000000000000001' as AccountRef

export const WORKLOAD_CRON_DECLARATIONS = [
  declaration('reconcile due facilitator invocations', 'reconciliation', 'reconcileDueFacilitatorInvocations'),
  declaration('refresh facilitator discovery', 'cron', 'refreshFacilitatorDiscovery'),
  declaration('refresh Agentic Market snapshots', 'cron', 'refreshAgenticMarketSnapshots'),
  declaration('refresh Agentic Economy API registry', 'cron', 'refreshAgenticEconomyApiRegistry'),
  declaration('continue market aggregate backfill', 'cron', 'continueMarketAggregateBackfill'),
  declaration('refresh current market presence', 'cron', 'refreshCurrentMarketPresence'),
  declaration('refresh capability supply readiness', 'cron', 'refreshCapabilitySupplyReadiness'),
  declaration('cleanup expired source write nonces', 'cron', 'cleanupExpiredSourceWriteNonces'),
  declaration('cleanup expired agent access oauth grants', 'cron', 'cleanupExpiredAgentAccessOAuthGrants'),
  declaration('run daily supplier settlement', 'cron', 'runDailySupplierSettlement'),
] as const

export type WorkloadCronName = typeof WORKLOAD_CRON_DECLARATIONS[number]['name']
export type WorkloadCronActionContext = Pick<ActionCtx, 'runAction' | 'runQuery'>
export type WorkloadCronMutationContext = Pick<MutationCtx, 'db' | 'runMutation'>

export type WorkloadCronSnapshot = AdmittedWorkloadContext & Readonly<{
  name: WorkloadCronName
  admittedAt: number
}>

export type WorkloadCronActionBinding = Readonly<{
  name: WorkloadCronName
  snapshot: WorkloadCronSnapshot
  resourceInvocationRef?: string
}>

export type WorkloadCronBoundaryErrorCode =
  | 'workload_consequence_not_declared'
  | 'workload_resource_authority_invalid'
  | 'workload_snapshot_invalid'

export class WorkloadCronBoundaryError extends Error {
  readonly code: WorkloadCronBoundaryErrorCode

  constructor(code: WorkloadCronBoundaryErrorCode) {
    super(code)
    this.name = 'WorkloadCronBoundaryError'
    this.code = code
  }
}

const workloadCronNameValue = v.union(
  v.literal('reconcile due facilitator invocations'),
  v.literal('refresh facilitator discovery'),
  v.literal('refresh Agentic Market snapshots'),
  v.literal('refresh Agentic Economy API registry'),
  v.literal('continue market aggregate backfill'),
  v.literal('refresh current market presence'),
  v.literal('refresh capability supply readiness'),
  v.literal('cleanup expired source write nonces'),
  v.literal('cleanup expired agent access oauth grants'),
  v.literal('run daily supplier settlement'),
)

export const workloadCronSnapshotValue = v.object({
  name: workloadCronNameValue,
  workloadKind: v.union(
    v.literal('job'),
    v.literal('cron'),
    v.literal('callback'),
    v.literal('reconciliation'),
  ),
  actorPrincipalRef: v.string(),
  activeAccountRef: v.string(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
  purpose: v.string(),
  source: v.string(),
  principalRevision: v.number(),
  activeAccountRevision: v.number(),
  accessVia: v.union(v.literal('ownership'), v.literal('membership')),
  admittedAt: v.number(),
})

const declarationByName = Object.fromEntries(
  WORKLOAD_CRON_DECLARATIONS.map((entry) => [entry.name, entry]),
) as Readonly<Record<WorkloadCronName, typeof WORKLOAD_CRON_DECLARATIONS[number]>>

export function parseWorkloadCronSnapshot(input: unknown): WorkloadCronSnapshot {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
  const record = input as Record<string, unknown>
  const expectedKeys = [
    'accessVia',
    'activeAccountRef',
    'activeAccountRevision',
    'actorPrincipalRef',
    'admittedAt',
    'correlationRef',
    'idempotencyRef',
    'name',
    'principalRevision',
    'purpose',
    'source',
    'workloadKind',
  ]
  const actualKeys = Object.keys(record).sort()
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
  const declaration = WORKLOAD_CRON_DECLARATIONS.find(({ name }) => name === record.name)
  if (declaration === undefined
    || record.workloadKind !== declaration.workloadKind
    || record.actorPrincipalRef !== declaration.actorPrincipalRef
    || record.activeAccountRef !== declaration.activeAccountRef
    || record.purpose !== declaration.name
    || record.source !== `convex/workloadCron:${declaration.handler}`
    || !Number.isSafeInteger(record.principalRevision)
    || (record.principalRevision as number) < 1
    || !Number.isSafeInteger(record.activeAccountRevision)
    || (record.activeAccountRevision as number) < 1
    || (record.accessVia !== 'ownership' && record.accessVia !== 'membership')
    || !Number.isSafeInteger(record.admittedAt)
    || (record.admittedAt as number) < 0) {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
  try {
    const context = createWorkloadContext({
      workloadKind: record.workloadKind,
      actorPrincipalRef: record.actorPrincipalRef,
      activeAccountRef: record.activeAccountRef,
      correlationRef: record.correlationRef,
      idempotencyRef: record.idempotencyRef,
      purpose: record.purpose,
      source: record.source,
    })
    return Object.freeze({
      name: declaration.name,
      ...context,
      principalRevision: record.principalRevision as number,
      activeAccountRevision: record.activeAccountRevision as number,
      accessVia: record.accessVia,
      admittedAt: record.admittedAt as number,
    })
  } catch {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
}

const CONSEQUENCE_OPERATIONS = [
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
type ConsequenceOperation = typeof CONSEQUENCE_OPERATIONS[number]

const consequenceOperationValue = v.union(
  v.literal('capabilityOperationInvocations:cancelBeforeClaim'),
  v.literal('capabilityOperationInvocations:claimAutomaticReconciliationCandidate'),
  v.literal('capabilityOperationInvocations:finishAutomaticReconciliation'),
  v.literal('capabilityOperationX402AuthorizationExpiry:queueExpiredX402Authorization'),
  v.literal('capabilitySupply:recordCapabilityProbeResult'),
  v.literal('facilitatorDiscovery:reconcile'),
  v.literal('marketExternalRegistry:begin'),
  v.literal('marketExternalRegistry:fail'),
  v.literal('marketExternalRegistry:finalize'),
  v.literal('marketExternalRegistry:writeBatch'),
  v.literal('marketExternalSnapshots:upsert'),
  v.literal('moneyLedger:reconcileExternalInvocationSpend'),
  v.literal('moneyX402PaymentAttempts:reconcileX402PaymentAttempt'),
)

const consequenceJsonScalarValue: Validator<null | boolean | number | string> = v.union(
  v.null(),
  v.boolean(),
  v.number(),
  v.string(),
)

function consequenceJsonValueAtDepth(depth: number): Validator<JsonValue, 'required', string> {
  if (depth === 0) return consequenceJsonScalarValue
  const child = consequenceJsonValueAtDepth(depth - 1)
  return v.union(
    consequenceJsonScalarValue,
    v.array(child),
    v.record(v.string(), child),
  )
}

// Consequence operations retain their own exact registered-function validators.
// This shared boundary additionally rejects non-JSON payload/result shapes and
// caps nesting before dispatching through the declared operation switch below.
const consequenceJsonValue = consequenceJsonValueAtDepth(12)
const consequencePayloadValue = v.record(v.string(), consequenceJsonValue)

function declaration<Name extends string, Handler extends string>(
  name: Name,
  workloadKind: WorkloadKind,
  handler: Handler,
) {
  return Object.freeze({
    name,
    workloadKind,
    handler,
    authority: 'canonical_workload' as const,
    actorPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
    activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
  })
}

class ConvexWorkloadContextStore implements WorkloadContextStore {
  constructor(private readonly ctx: Pick<QueryCtx, 'db'>) {}

  async getPrincipal(principalRef: PrincipalRef): Promise<Principal | undefined> {
    const row = await this.ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', principalRef))
      .unique()
    return row === null ? undefined : principalFromRow(row)
  }

  async getAccount(accountRef: AccountRef): Promise<Account | undefined> {
    const row = await this.ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef))
      .unique()
    return row === null ? undefined : accountFromRow(row)
  }

  async getOwnership(account: Account): Promise<AccountOwnership | undefined> {
    const row = await this.ctx.db
      .query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
      .unique()
    return row === null ? undefined : ownershipFromRow(row)
  }

  async getActiveMembership(accountRef: AccountRef, principalRef: PrincipalRef): Promise<Membership | undefined> {
    const row = await this.ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => (
        query
          .eq('accountRef', accountRef)
          .eq('memberPrincipalRef', principalRef)
          .eq('lifecycle', 'active')
      ))
      .unique()
    return row === null ? undefined : membershipFromRow(row)
  }
}

function actionContextFromRow(value: Doc<'accounts'>['lastAction']): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: principalRef(value.actorPrincipalRef),
    activeAccountRef: accountRef(value.activeAccountRef),
    correlationRef: value.correlationRef,
    idempotencyRef: value.idempotencyRef,
  })
}

function principalFromRow(row: Doc<'principals'>): Principal {
  return Object.freeze({
    principalRef: principalRef(row.principalRef),
    kind: row.kind,
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.mergedIntoPrincipalRef === undefined
      ? {}
      : { mergedIntoPrincipalRef: principalRef(row.mergedIntoPrincipalRef) }),
  })
}

function accountFromRow(row: Doc<'accounts'>): Account {
  return Object.freeze({
    accountRef: accountRef(row.accountRef),
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    recoveryPolicy: row.recoveryPolicy,
    creationActorPrincipalRef: principalRef(row.creationActorPrincipalRef),
    creationIdempotencyRef: row.creationIdempotencyRef,
    initialOwnershipRef: ownershipRef(row.initialOwnershipRef),
    currentOwnershipRef: ownershipRef(row.currentOwnershipRef),
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastAction: actionContextFromRow(row.lastAction),
  })
}

function ownershipFromRow(row: Doc<'accountOwnerships'>): AccountOwnership {
  return Object.freeze({
    ownershipRef: ownershipRef(row.ownershipRef),
    accountRef: accountRef(row.accountRef),
    ownerPrincipalRef: principalRef(row.ownerPrincipalRef),
    lifecycle: row.lifecycle,
    changeKind: row.changeKind,
    revision: row.revision,
    createdAt: row.createdAt,
    createdBy: actionContextFromRow(row.createdBy),
    ...(row.predecessorOwnershipRef === undefined
      ? {}
      : { predecessorOwnershipRef: ownershipRef(row.predecessorOwnershipRef) }),
    ...(row.successionAuthorizationRef === undefined
      ? {}
      : { successionAuthorizationRef: row.successionAuthorizationRef }),
    ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
    ...(row.endedBy === undefined ? {} : { endedBy: actionContextFromRow(row.endedBy) }),
    ...(row.successorOwnershipRef === undefined
      ? {}
      : { successorOwnershipRef: ownershipRef(row.successorOwnershipRef) }),
  })
}

function membershipFromRow(row: Doc<'memberships'>): Membership {
  return Object.freeze({
    membershipRef: membershipRef(row.membershipRef),
    accountRef: accountRef(row.accountRef),
    memberPrincipalRef: principalRef(row.memberPrincipalRef),
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    createdBy: actionContextFromRow(row.createdBy),
    ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
    ...(row.endedBy === undefined ? {} : { endedBy: actionContextFromRow(row.endedBy) }),
  })
}

export async function admitWorkloadCron(
  ctx: Pick<QueryCtx, 'db'>,
  name: WorkloadCronName,
): Promise<WorkloadCronSnapshot> {
  const declared = declarationByName[name]
  const admittedAt = Date.now()
  const sourceRef = declared.handler.replaceAll(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`)
  const admitted = await new WorkloadContextAdmission(new ConvexWorkloadContextStore(ctx)).admit({
    workloadKind: declared.workloadKind,
    actorPrincipalRef: declared.actorPrincipalRef,
    activeAccountRef: declared.activeAccountRef,
    correlationRef: `cron:${sourceRef}:${admittedAt}`,
    idempotencyRef: `cron:${sourceRef}:${admittedAt}`,
    purpose: declared.name,
    source: `convex/workloadCron:${declared.handler}`,
  })
  return Object.freeze({ name, ...admitted, admittedAt })
}

export async function admitWorkloadCronHandler(
  ctx: QueryCtx,
  args: Readonly<{ name: WorkloadCronName }>,
): Promise<WorkloadCronSnapshot> {
  return await admitWorkloadCron(ctx, args.name)
}

export const admit = internalQuery({
  args: { name: workloadCronNameValue },
  returns: workloadCronSnapshotValue,
  handler: admitWorkloadCronHandler,
})

export async function reconcileWorkloadCronSnapshot(
  ctx: Pick<QueryCtx, 'db'>,
  name: WorkloadCronName,
  snapshot: WorkloadCronSnapshot,
): Promise<WorkloadCronSnapshot> {
  const declared = declarationByName[name]
  if (snapshot.name !== name
    || snapshot.workloadKind !== declared.workloadKind
    || snapshot.actorPrincipalRef !== declared.actorPrincipalRef
    || snapshot.activeAccountRef !== declared.activeAccountRef
    || snapshot.purpose !== declared.name
    || snapshot.source !== `convex/workloadCron:${declared.handler}`
    || !Number.isSafeInteger(snapshot.admittedAt)
    || snapshot.admittedAt > Date.now()) {
    throw new WorkloadCronBoundaryError('workload_snapshot_invalid')
  }
  return await admitWorkloadCron(ctx, name)
}

export async function reconcileWorkloadCronSnapshotHandler(
  ctx: QueryCtx,
  args: Readonly<{
    name: WorkloadCronName
    snapshot: WorkloadCronSnapshot
  }>,
): Promise<WorkloadCronSnapshot> {
  return await reconcileWorkloadCronSnapshot(ctx, args.name, parseWorkloadCronSnapshot(args.snapshot))
}

export async function reconcileWorkloadCronResourceAccount(
  ctx: Pick<QueryCtx, 'db'>,
  name: WorkloadCronName,
  snapshot: WorkloadCronSnapshot,
  resourceAccountRef: string,
): Promise<WorkloadCronSnapshot> {
  const current = await reconcileWorkloadCronSnapshot(ctx, name, snapshot)
  const canonicalResourceAccountRef = accountRef(resourceAccountRef)
  if (canonicalResourceAccountRef !== current.activeAccountRef) {
    await new WorkloadContextAdmission(new ConvexWorkloadContextStore(ctx)).attributeCrossAccount({
      context: workloadContextFromSnapshot(current),
      counterpartyAccountRef: canonicalResourceAccountRef,
    })
  }
  return current
}

export const reconcile = internalQuery({
  args: {
    name: workloadCronNameValue,
    snapshot: workloadCronSnapshotValue,
  },
  returns: workloadCronSnapshotValue,
  handler: reconcileWorkloadCronSnapshotHandler,
})

async function attributeInvocationResourceAccount(
  ctx: MutationCtx,
  current: WorkloadCronSnapshot,
  invocationRef: string,
): Promise<void> {
  const invocation = await ctx.db
    .query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .unique()
  if (invocation === null) throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  const grant = await ctx.db
    .query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', invocation.grantRef))
    .unique()
  if (grant === null) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  // The grant chain remains the only Account source. Legacy invocation fields
  // are checked solely as fail-closed immutable-integrity evidence and never
  // seed the admission context below.
  if (invocation.principalId !== grant.subjectPrincipalRef
    || invocation.ownerId !== grant.accountRef
    || invocation.grantExpiresAt !== grant.expiresAt
    || !grant.resourceRefs.includes(invocation.operationRef)) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  try {
    const canonicalGrantRef = delegationGrantRef(invocation.grantRef)
    const canonicalSubjectPrincipalRef = principalRef(grant.subjectPrincipalRef)
    const canonicalAccountRef = accountRef(grant.accountRef)
    const snapshot = await new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, canonicalSubjectPrincipalRef),
    ).admitConsequence({
      grantRef: canonicalGrantRef,
      expectedGeneration: invocation.grantGeneration,
      context: {
        actorPrincipalRef: canonicalSubjectPrincipalRef,
        activeAccountRef: canonicalAccountRef,
        correlationRef: current.correlationRef,
        idempotencyRef: `cron-admit:${current.admittedAt}:${canonicalGrantRef}:${invocation.grantGeneration}`,
      },
      requiredScopes: grant.scopes,
      resourceRefs: [invocation.operationRef],
      budgetAmount: 0,
    })
    const consequenceNow = Date.now()
    if (snapshot.grantRef !== canonicalGrantRef
      || snapshot.generation !== invocation.grantGeneration
      || snapshot.accountRef !== canonicalAccountRef
      || snapshot.actorPrincipalRef !== canonicalSubjectPrincipalRef
      || snapshot.expiresAt <= consequenceNow) {
      throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
    }
    if (canonicalAccountRef !== current.activeAccountRef) {
      await new WorkloadContextAdmission(new ConvexWorkloadContextStore(ctx)).attributeCrossAccount({
        context: workloadContextFromSnapshot(current),
        counterpartyAccountRef: canonicalAccountRef,
      })
    }
  } catch (error) {
    if (error instanceof WorkloadCronBoundaryError) throw error
    if (error instanceof DelegationError) {
      throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
    }
    throw error
  }
}

function workloadContextFromSnapshot(snapshot: WorkloadCronSnapshot) {
  return {
    workloadKind: snapshot.workloadKind,
    actorPrincipalRef: snapshot.actorPrincipalRef,
    activeAccountRef: snapshot.activeAccountRef,
    correlationRef: snapshot.correlationRef,
    idempotencyRef: snapshot.idempotencyRef,
    purpose: snapshot.purpose,
    source: snapshot.source,
  }
}

function declaredConsequenceOperation(reference: FunctionReference<'mutation', 'internal'>): ConsequenceOperation {
  const name = getFunctionName(reference)
  if (!CONSEQUENCE_OPERATIONS.includes(name as ConsequenceOperation)) {
    throw new WorkloadCronBoundaryError('workload_consequence_not_declared')
  }
  return name as ConsequenceOperation
}

export function bindWorkloadCronActionContext(
  ctx: ActionCtx,
  binding: WorkloadCronActionBinding,
): ActionCtx {
  const runMutation: ActionCtx['runMutation'] = async (reference, ...args) => {
    const payload = args[0] ?? {}
    return await ctx.runMutation(internal.workloadCron.dispatchConsequence, {
      name: binding.name,
      snapshot: binding.snapshot,
      ...(binding.resourceInvocationRef === undefined
        ? {}
        : { resourceInvocationRef: binding.resourceInvocationRef }),
      operation: declaredConsequenceOperation(reference as FunctionReference<'mutation', 'internal'>),
      payload,
    }) as never
  }
  return new Proxy(ctx, {
    get(target, property, receiver) {
      return property === 'runMutation'
        ? runMutation
        : Reflect.get(target, property, receiver)
    },
  })
}

export async function dispatchWorkloadCronConsequenceHandler(
  ctx: MutationCtx,
  args: Readonly<{
    name: WorkloadCronName
    snapshot: WorkloadCronSnapshot
    resourceInvocationRef?: string
    operation: ConsequenceOperation
    payload: Readonly<Record<string, JsonValue>>
  }>,
): Promise<JsonValue> {
  const current = await reconcileWorkloadCronSnapshot(ctx as Pick<QueryCtx, 'db'>, args.name, args.snapshot)
  if (args.resourceInvocationRef !== undefined) {
    await attributeInvocationResourceAccount(ctx, current, args.resourceInvocationRef)
  }
  switch (args.operation) {
    case 'capabilityOperationInvocations:cancelBeforeClaim':
      return await ctx.runMutation(internal.capabilityOperationInvocations.cancelBeforeClaim, args.payload as never)
    case 'capabilityOperationInvocations:claimAutomaticReconciliationCandidate':
      return await ctx.runMutation(internal.capabilityOperationInvocations.claimAutomaticReconciliationCandidate, args.payload as never)
    case 'capabilityOperationInvocations:finishAutomaticReconciliation':
      return await ctx.runMutation(internal.capabilityOperationInvocations.finishAutomaticReconciliation, args.payload as never)
    case 'capabilityOperationX402AuthorizationExpiry:queueExpiredX402Authorization':
      return await ctx.runMutation(internal.capabilityOperationX402AuthorizationExpiry.queueExpiredX402Authorization, args.payload as never)
    case 'capabilitySupply:recordCapabilityProbeResult':
      return await ctx.runMutation(internal.capabilitySupply.recordCapabilityProbeResult, args.payload as never)
    case 'facilitatorDiscovery:reconcile':
      return await ctx.runMutation(internal.facilitatorDiscovery.reconcile, {
        ...args.payload,
        workload: current,
      } as never)
    case 'marketExternalRegistry:begin':
      return await ctx.runMutation(internal.marketExternalRegistry.begin, args.payload as never)
    case 'marketExternalRegistry:fail':
      return await ctx.runMutation(internal.marketExternalRegistry.fail, args.payload as never)
    case 'marketExternalRegistry:finalize':
      return await ctx.runMutation(internal.marketExternalRegistry.finalize, args.payload as never)
    case 'marketExternalRegistry:writeBatch':
      return await ctx.runMutation(internal.marketExternalRegistry.writeBatch, args.payload as never)
    case 'marketExternalSnapshots:upsert':
      return await ctx.runMutation(internal.marketExternalSnapshots.upsert, args.payload as never)
    case 'moneyLedger:reconcileExternalInvocationSpend':
      return await ctx.runMutation(internal.moneyLedger.reconcileExternalInvocationSpend, args.payload as never)
    case 'moneyX402PaymentAttempts:reconcileX402PaymentAttempt':
      return await ctx.runMutation(internal.moneyX402PaymentAttempts.reconcileX402PaymentAttempt, args.payload as never)
  }
}

export const dispatchConsequence = internalMutation({
  args: {
    name: workloadCronNameValue,
    snapshot: workloadCronSnapshotValue,
    resourceInvocationRef: v.optional(v.string()),
    operation: consequenceOperationValue,
    payload: consequencePayloadValue,
  },
  returns: consequenceJsonValue,
  handler: dispatchWorkloadCronConsequenceHandler,
})

async function runAdmittedAction(
  ctx: WorkloadCronActionContext,
  name: WorkloadCronName,
  target: FunctionReference<'action', 'internal'>,
  args: DefaultFunctionArgs,
): Promise<null> {
  const workload = await ctx.runQuery(internal.workloadCron.admit, { name })
  await ctx.runAction(target, { ...args, workload })
  return null
}

async function runAdmittedMutation(
  ctx: WorkloadCronMutationContext,
  name: WorkloadCronName,
  target: FunctionReference<'mutation', 'internal'>,
  args: DefaultFunctionArgs,
): Promise<null> {
  const workload = await admitWorkloadCron(ctx as Pick<QueryCtx, 'db'>, name)
  await ctx.runMutation(target, { ...args, workload })
  return null
}

export async function reconcileDueFacilitatorInvocationsHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(
    ctx,
    'reconcile due facilitator invocations',
    internal.capabilityOperationInvocationWorker.reconcileScheduled,
    {},
  )
}

export async function refreshFacilitatorDiscoveryHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(
    ctx,
    'refresh facilitator discovery',
    internal.facilitatorDiscoveryAction.run,
    {},
  )
}

export async function refreshAgenticMarketSnapshotsHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(
    ctx,
    'refresh Agentic Market snapshots',
    internal.marketExternalRefresh.run,
    {},
  )
}

export async function refreshAgenticEconomyApiRegistryHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(
    ctx,
    'refresh Agentic Economy API registry',
    internal.marketExternalRegistryRefresh.run,
    {},
  )
}

export async function continueMarketAggregateBackfillHandler(ctx: WorkloadCronMutationContext): Promise<null> {
  return await runAdmittedMutation(
    ctx,
    'continue market aggregate backfill',
    internal.marketAggregateBackfill.run,
    {},
  )
}

export async function refreshCurrentMarketPresenceHandler(
  ctx: WorkloadCronMutationContext,
  args: Readonly<{ cursor?: string | null }> = {},
): Promise<null> {
  return await runAdmittedMutation(
    ctx,
    'refresh current market presence',
    internal.marketPresence.refresh,
    { cursor: args.cursor ?? null },
  )
}

export async function refreshCapabilitySupplyReadinessHandler(ctx: WorkloadCronMutationContext): Promise<null> {
  const workload = await admitWorkloadCron(ctx as Pick<QueryCtx, 'db'>, 'refresh capability supply readiness')
  await ctx.runMutation(internal.capabilitySupply.scheduleDueCapabilityProbes, { workload })
  return null
}

export async function cleanupExpiredSourceWriteNoncesHandler(
  ctx: WorkloadCronMutationContext,
  args: Readonly<{ now?: number; batchSize?: number }> = {},
): Promise<null> {
  return await runAdmittedMutation(
    ctx,
    'cleanup expired source write nonces',
    internal.sourceWriteAdmission.cleanupExpiredSourceWriteNonces,
    args,
  )
}

export async function cleanupExpiredAgentAccessOAuthGrantsHandler(
  ctx: WorkloadCronMutationContext,
  args: Readonly<{ now?: number; batchSize?: number }> = {},
): Promise<null> {
  return await runAdmittedMutation(
    ctx,
    'cleanup expired agent access oauth grants',
    internal.agentAccessOAuth.cleanupExpiredOAuthGrants,
    args,
  )
}

export async function runDailySupplierSettlementHandler(ctx: WorkloadCronMutationContext): Promise<null> {
  return await runAdmittedMutation(
    ctx,
    'run daily supplier settlement',
    internal.moneyLedger.runDailySupplierSettlement,
    {},
  )
}

export const reconcileDueFacilitatorInvocations = internalAction({
  args: {},
  returns: v.null(),
  handler: reconcileDueFacilitatorInvocationsHandler,
})

export const refreshFacilitatorDiscovery = internalAction({
  args: {},
  returns: v.null(),
  handler: refreshFacilitatorDiscoveryHandler,
})

export const refreshAgenticMarketSnapshots = internalAction({
  args: {},
  returns: v.null(),
  handler: refreshAgenticMarketSnapshotsHandler,
})

export const refreshAgenticEconomyApiRegistry = internalAction({
  args: {},
  returns: v.null(),
  handler: refreshAgenticEconomyApiRegistryHandler,
})

export const continueMarketAggregateBackfill = internalMutation({
  args: {},
  returns: v.null(),
  handler: continueMarketAggregateBackfillHandler,
})

export const refreshCurrentMarketPresence = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: refreshCurrentMarketPresenceHandler,
})

export const refreshCapabilitySupplyReadiness = internalMutation({
  args: {},
  returns: v.null(),
  handler: refreshCapabilitySupplyReadinessHandler,
})

export const cleanupExpiredSourceWriteNonces = internalMutation({
  args: { now: v.optional(v.number()), batchSize: v.optional(v.number()) },
  returns: v.null(),
  handler: cleanupExpiredSourceWriteNoncesHandler,
})

export const cleanupExpiredAgentAccessOAuthGrants = internalMutation({
  args: { now: v.optional(v.number()), batchSize: v.optional(v.number()) },
  returns: v.null(),
  handler: cleanupExpiredAgentAccessOAuthGrantsHandler,
})

export const runDailySupplierSettlement = internalMutation({
  args: {},
  returns: v.null(),
  handler: runDailySupplierSettlementHandler,
})
