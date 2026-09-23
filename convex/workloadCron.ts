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
import type { Doc } from './_generated/dataModel'
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

// Self-healing bootstrap keeps the cron fleet's fixed machine identity present.
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

function matchesCapturedAccessGrant(
  grant: Doc<'agentAccessGrants'> | null,
  call: Doc<'capabilityCalls'>,
): boolean {
  return grant !== null
    && grant.principalId === call.principalId
    && grant.ownerId === call.ownerId
    && grant.credentialId === call.credentialId
    && grant.applicationRef === call.applicationRef
    && grant.environment === call.environment
    && grant.generation === call.grantGeneration
    && grant.spendingPolicyDigest === call.policyDigest
    && grant.expiresAt === call.grantExpiresAt
}

/**
 * CONTRACT: attributeInvocationResourceAccount
 * Requires current system workload authority and matching immutable Call,
 * access-grant and canonical delegation identities. Refund bookkeeping is
 * limited to its exact Call and an existing pre-claim refund proof.
 * Ensures Account attribution survives expired/revoked buyer authority only
 * for claiming/finishing that proven refund; other consequences require live
 * canonical delegation. Access and delegation generations remain distinct.
 * Invariant: this never grants Provider effect authority or changes a booking.
 * On violation: workload_resource_authority_invalid, before consequence writes.
 */
async function attributeInvocationResourceAccount(
  ctx: MutationCtx,
  current: WorkloadCronSnapshot,
  callRef: string,
  operation: ConsequenceOperation,
  payload: Readonly<Record<string, JsonValue>>,
): Promise<void> {
  const invocation = await ctx.db
    .query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (invocation === null) throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  const grant = await ctx.db
    .query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', invocation.grantRef))
    .unique()
  if (grant === null) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  const accessGrant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', invocation.grantRef))
    .unique()
  if (!matchesCapturedAccessGrant(accessGrant, invocation)) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  const refundBookkeeping = operation === 'capabilityCalls:claimAutomaticReconciliationCandidate'
    || operation === 'capabilityCalls:finishAutomaticReconciliation'
  if (refundBookkeeping && payload.callRef !== callRef) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  // The grant chain remains the only Account source. Legacy invocation fields
  // are checked solely as fail-closed immutable-integrity evidence and never
  // seed the admission context below.
  if (invocation.principalId !== grant.subjectPrincipalRef
    || invocation.ownerId !== grant.accountRef
    || invocation.grantExpiresAt !== grant.expiresAt
    || (!grant.resourceRefs.includes('*') && !grant.resourceRefs.includes(invocation.toolRef))) {
    throw new WorkloadCronBoundaryError('workload_resource_authority_invalid')
  }
  try {
    const canonicalGrantRef = delegationGrantRef(invocation.grantRef)
    const canonicalSubjectPrincipalRef = principalRef(grant.subjectPrincipalRef)
    const canonicalAccountRef = accountRef(grant.accountRef)
    if (refundBookkeeping && await ctx.runQuery(internal.capabilityCalls.readPreClaimRefund, { callRef })) {
      if (canonicalAccountRef !== current.activeAccountRef) {
        await new WorkloadContextAdmission(new ConvexWorkloadContextStore(ctx)).attributeCrossAccount({
          context: workloadContextFromSnapshot(current),
          counterpartyAccountRef: canonicalAccountRef,
        })
      }
      return
    }
    const snapshot = await new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, canonicalSubjectPrincipalRef),
    ).admitConsequence({
      grantRef: canonicalGrantRef,
      expectedGeneration: grant.generation,
      context: {
        actorPrincipalRef: canonicalSubjectPrincipalRef,
        activeAccountRef: canonicalAccountRef,
        correlationRef: current.correlationRef,
        idempotencyRef: `cron-admit:${current.admittedAt}:${canonicalGrantRef}:${grant.generation}`,
      },
      requiredScopes: grant.scopes,
      resourceRefs: [invocation.toolRef],
      budgetAmount: 0,
    })
    const consequenceNow = Date.now()
    if (snapshot.grantRef !== canonicalGrantRef
      || snapshot.generation !== grant.generation
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

type ConsequenceHandler = (
  ctx: MutationCtx,
  payload: Readonly<Record<string, JsonValue>>,
  current: WorkloadCronSnapshot,
) => Promise<JsonValue>

// Exhaustive by construction: removing an operation from CONSEQUENCE_OPERATIONS
// makes its entry here a type error, and no operation can fall through.
const CONSEQUENCE_HANDLERS: Record<ConsequenceOperation, ConsequenceHandler> = {
  'capabilityCalls:cancelBeforeClaim': (ctx, payload) => ctx.runMutation(internal.capabilityCalls.cancelBeforeClaim, payload as never),
  'capabilityCalls:claimAutomaticReconciliationCandidate': (ctx, payload) => ctx.runMutation(internal.capabilityCalls.claimAutomaticReconciliationCandidate, payload as never),
  'capabilityCalls:finishAutomaticReconciliation': (ctx, payload) => ctx.runMutation(internal.capabilityCalls.finishAutomaticReconciliation, payload as never),
  'capabilityCallX402AuthorizationExpiry:queueExpiredX402Authorization': (ctx, payload) => ctx.runMutation(internal.capabilityCallX402AuthorizationExpiry.queueExpiredX402Authorization, payload as never),
  'capabilitySupply:recordCapabilityProbeResult': (ctx, payload) => ctx.runMutation(internal.capabilitySupply.recordCapabilityProbeResult, payload as never),
  'facilitatorDiscovery:reconcile': (ctx, payload, current) => ctx.runMutation(internal.facilitatorDiscovery.reconcile, { ...payload, workload: current } as never),
  'moneyTreasury:recordObservation': async (ctx, payload): Promise<JsonValue> => {
    const result = await ctx.runMutation(internal.moneyTreasury.recordObservation, payload as never)
    if (result.kind === 'accepted') {
      return { kind: result.kind, replayed: result.replayed, observationRef: result.observationRef }
    }
    return { kind: result.kind, code: result.code, retryable: result.retryable }
  },
  'moneyX402PaymentAttempts:reconcileX402PaymentAttempt': (ctx, payload) => ctx.runMutation(internal.moneyX402PaymentAttempts.reconcileX402PaymentAttempt, payload as never),
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
    await attributeInvocationResourceAccount(ctx, current, args.resourceInvocationRef, args.operation, args.payload)
  }
  return await CONSEQUENCE_HANDLERS[args.operation](ctx, args.payload, current)
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
    internal.capabilityCallWorker.reconcileScheduled,
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

export async function refreshAgenticEconomyApiRegistryHandler(ctx: WorkloadCronActionContext): Promise<null> {
  await runAdmittedAction(ctx, 'refresh Agentic Economy API registry', internal.x402DirectoryIndexRefresh.start, {})
  return null
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

// This wrapper admits the canonical workload before the paginated maintenance entry point.
export async function reconcileBusinessSupplyProjectionsHandler(ctx: WorkloadCronMutationContext): Promise<null> {
  await admitWorkloadCron(ctx as Pick<QueryCtx, 'db'>, 'reconcile business supply projections')
  await ctx.runMutation(internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {})
  // Reconcile provider directory rows that bypassed publish/withdraw hooks.
  await ctx.runMutation(internal.x402DirectoryIndexStore.reconcileProviderDirectoryRows, {})
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

export async function observeX402TreasuryHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(
    ctx,
    'observe x402 treasury',
    internal.moneyTreasuryObservation.observe,
    {},
  )
}

export async function refreshMarketFlowHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(ctx, 'refresh market flow', internal.marketFlowRefresh.run, {})
}

export async function snapshotMarketplaceMetricsDayHandler(ctx: WorkloadCronActionContext): Promise<null> {
  await ctx.runQuery(internal.workloadCron.admit, { name: 'snapshot marketplace metrics day' })
  await ctx.runAction(internal.adminConsoleMetrics.snapshotMarketplaceMetricsDay, {})
  return null
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

export const reconcileBusinessSupplyProjections = internalMutation({
  args: {},
  returns: v.null(),
  handler: reconcileBusinessSupplyProjectionsHandler,
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

export const observeX402Treasury = internalAction({
  args: {},
  returns: v.null(),
  handler: observeX402TreasuryHandler,
})

export const refreshMarketFlow = internalAction({
  args: {},
  returns: v.null(),
  handler: refreshMarketFlowHandler,
})

export const snapshotMarketplaceMetricsDay = internalAction({
  args: {},
  returns: v.null(),
  handler: snapshotMarketplaceMetricsDayHandler,
})
