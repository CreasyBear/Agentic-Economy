import {
  getFunctionName,
  type DefaultFunctionArgs,
  type FunctionReference,
} from 'convex/server'
import { v } from 'convex/values'

import type { JsonValue } from '@/modules/capability-contract/public'
import {
  accountRef,
  principalRef,
  WorkloadContextAdmission,
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
import {
  CONSEQUENCE_OPERATIONS,
  ConvexWorkloadContextStore,
  SYSTEM_WORKLOAD_ACCOUNT_REF,
  SYSTEM_WORKLOAD_MEMBERSHIP_REF,
  SYSTEM_WORKLOAD_OWNER_PRINCIPAL_REF,
  SYSTEM_WORKLOAD_OWNERSHIP_REF,
  SYSTEM_WORKLOAD_PRINCIPAL_REF,
  WorkloadCronBoundaryError,
  consequenceJsonValue,
  consequenceOperationValue,
  consequencePayloadValue,
  declarationByName,
  parseWorkloadCronSnapshot,
  workloadCronNameValue,
  workloadCronSnapshotValue,
  type ConsequenceOperation,
  type WorkloadCronActionBinding,
  type WorkloadCronActionContext,
  type WorkloadCronMutationContext,
  type WorkloadCronName,
  type WorkloadCronSnapshot,
} from './lib/workloadCron/context'

export * from './lib/workloadCron/context'

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

type EnsurePlatformWorkloadIdentitiesResult = Readonly<{
  kind: 'ensured'
  created: string[]
}>

// Self-healing bootstrap for the cron fleet's machine identity. Every scheduled
// workload admits through WorkloadContextAdmission with fixed system refs,
// which throws workload_principal_missing on any fresh deployment. This
// internalMutation inserts the canonical rows (see convex/agentAccessOAuth.test.ts
// and tests/integration/facilitator-discovery.test.ts fixtures) when absent and
// leaves existing rows untouched, so it is safe to run on every stack bring-up.
export async function ensurePlatformWorkloadIdentitiesHandler(
  ctx: MutationCtx,
): Promise<EnsurePlatformWorkloadIdentitiesResult> {
  const now = Date.now()
  const created: string[] = []
  const action = Object.freeze({
    actorPrincipalRef: SYSTEM_WORKLOAD_OWNER_PRINCIPAL_REF,
    activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    correlationRef: 'platform-identity:cron',
    idempotencyRef: 'platform-identity:cron',
  })
  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', SYSTEM_WORKLOAD_PRINCIPAL_REF))
    .unique()
  if (principal === null) {
    await ctx.db.insert('principals', {
      principalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
      kind: 'workload',
      displayName: 'System scheduled workload',
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    created.push('principal')
  }
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', SYSTEM_WORKLOAD_ACCOUNT_REF))
    .unique()
  if (account === null) {
    await ctx.db.insert('accounts', {
      accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      displayName: 'System operations',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: SYSTEM_WORKLOAD_OWNER_PRINCIPAL_REF,
      creationIdempotencyRef: 'platform-identity:cron:account',
      initialOwnershipRef: SYSTEM_WORKLOAD_OWNERSHIP_REF,
      currentOwnershipRef: SYSTEM_WORKLOAD_OWNERSHIP_REF,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastAction: action,
    })
    created.push('account')
  }
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', SYSTEM_WORKLOAD_OWNERSHIP_REF))
    .unique()
  if (ownership === null) {
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: SYSTEM_WORKLOAD_OWNERSHIP_REF,
      accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      ownerPrincipalRef: SYSTEM_WORKLOAD_OWNER_PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: now,
      createdBy: action,
    })
    created.push('ownership')
  }
  const membership = await ctx.db.query('memberships')
    .withIndex('by_membershipRef', (query) => query.eq('membershipRef', SYSTEM_WORKLOAD_MEMBERSHIP_REF))
    .unique()
  if (membership === null) {
    await ctx.db.insert('memberships', {
      membershipRef: SYSTEM_WORKLOAD_MEMBERSHIP_REF,
      accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      memberPrincipalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      createdBy: action,
    })
    created.push('membership')
  }
  return { kind: 'ensured', created }
}

export const ensurePlatformWorkloadIdentities = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('ensured'),
    created: v.array(v.string()),
  }),
  handler: ensurePlatformWorkloadIdentitiesHandler,
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
