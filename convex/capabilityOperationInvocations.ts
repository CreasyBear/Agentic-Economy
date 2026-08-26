import { vOnCompleteArgs } from '@convex-dev/workpool'
import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'
import { action, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from './_generated/server'
import { sourceWriteArgs } from './sourceWriteAdmission'
import { actionInvocationTransactArgs } from './actionInvocationControl'
import {
  invocationReconciliationValue,
  jsonObject,
  operationResultValue,
  reconciliationEvidenceValue,
  recoveryResultValue,
  operationInvokeAuthorityValue,
  statusResultValue,
  usageValue,
} from '@/modules/capability-execution/convex'
import {
  abandonHandler,
  admitHandler,
  decideOperationApprovalHandler,
  listPendingOperationApprovalsHandler,
  reserveHandler,
} from './capabilityOperationAdmission'
import {
  cancelBeforeClaimHandler,
  claimDispatchHandler,
  dispatchHandler,
  finalizeDispatchHandler,
  openDispatchHandler,
} from './capabilityOperationDispatch'
import { completeWorkHandler } from './capabilityOperationWorkComplete'
import {
  cancelInvocationHandler,
  cancelOwnerInvocationHandler,
  invokeHandler,
  projectRecoveryHandler,
  readInvocationStatusHandler,
  readOwnerInvocationStatusHandler,
  readOwnerRecoveryHandler,
  readProviderLeaseAuthorityHandler,
  readRecoveryHandler,
  readReplayHandler,
  reconcileInvocationHandler,
  reconcileOwnerInvocationHandler,
  recordHandler,
} from './capabilityOperationInvokeActions'
import { resolveBusinessActor } from './authz'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  DelegationService,
  delegationGrantRef,
  type DelegationStore,
} from '@/modules/authority/delegation/public'
import { accountRef, principalRef } from '@/modules/principal-account/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './lib/delegationPersistence'

const RECONCILIATION_MAX_CANDIDATES = 25
const RECONCILIATION_LEASE_MS = 60_000
const RECONCILIATION_MAX_ATTEMPTS = 5
const RECONCILIATION_LEASE_OWNER_MAX_LENGTH = 200
const RECONCILIATION_BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000] as const
type InvocationReconciliation = Infer<typeof invocationReconciliationValue>
type ReconciliationReason = InvocationReconciliation['reason']

const reconciliationReason = v.union(
  v.literal('unknown_settlement'),
  v.literal('pending_accounting'),
  v.literal('refund_pending'),
  v.literal('custody_cap'),
  v.literal('recovery_failed'),
  v.literal('authorization_expired'),
)
const reconciliationCandidateValue = v.object({
  invocationRef: v.string(),
  attemptCount: v.number(),
  nextAttemptAt: v.number(),
})
const reconciliationClaimResult = v.union(
  v.object({ kind: v.literal('claimed'), principalId: v.string(), credentialId: v.string() }),
  v.object({ kind: v.literal('not_claimed') }),
)
const reconciliationFinishResult = v.union(
  v.object({ kind: v.literal('completed') }),
  v.object({ kind: v.literal('retried'), attemptCount: v.number(), nextAttemptAt: v.number() }),
  v.object({ kind: v.literal('manual_review') }),
  v.object({ kind: v.literal('refused'), code: v.union(v.literal('not_found'), v.literal('not_claimed'), v.literal('stale_lease')) }),
)
const reconciliationFinishOutcome = v.union(
  v.literal('success'),
  v.literal('terminal'),
  v.literal('reconciliation_required'),
  v.literal('error'),
)
function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function isBoundedLeaseOwner(value: string): boolean {
  return value.trim().length > 0 && value.length <= RECONCILIATION_LEASE_OWNER_MAX_LENGTH
}

function isValidInvocationReconciliation(value: InvocationReconciliation | undefined): value is InvocationReconciliation {
  return value !== undefined
    && Number.isSafeInteger(value.attemptCount)
    && value.attemptCount >= 0
    && isFiniteNonNegative(value.nextAttemptAt)
    && (value.leaseOwner === undefined || isBoundedLeaseOwner(value.leaseOwner))
    && (value.leaseExpiresAt === undefined || isFiniteNonNegative(value.leaseExpiresAt))
    && (value.disposition === 'automatic' || value.disposition === 'manual_review')
    && (
      value.reason === 'unknown_settlement'
      || value.reason === 'pending_accounting'
      || value.reason === 'refund_pending'
      || value.reason === 'custody_cap'
      || value.reason === 'recovery_failed'
      || value.reason === 'authorization_expired'
    )
}

function automaticReconciliationAt(now: number): InvocationReconciliation {
  return {
    attemptCount: 0,
    nextAttemptAt: now,
    disposition: 'automatic',
    reason: 'recovery_failed',
  }
}

function boundedCandidateLimit(value: number): number {
  if (!Number.isFinite(value)) return RECONCILIATION_MAX_CANDIDATES
  return Math.min(Math.max(Math.trunc(value), 0), RECONCILIATION_MAX_CANDIDATES)
}

async function initializeReconciliationIfAbsent(
  ctx: MutationCtx,
  invocationRef: string,
  now: number,
): Promise<void> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (q) => q.eq('invocationRef', invocationRef))
    .unique()
  if (row === null || row.state !== 'reconciliation_required' || row.reconciliation !== undefined) return
  const nextAttemptAt = isFiniteNonNegative(now) ? now : Date.now()
  await ctx.db.patch(row._id, { reconciliation: automaticReconciliationAt(nextAttemptAt), updatedAt: nextAttemptAt })
}

async function recordWithReconciliationInitialization(
  ctx: Parameters<typeof recordHandler>[0],
  args: Parameters<typeof recordHandler>[1],
): Promise<Awaited<ReturnType<typeof recordHandler>>> {
  const result = await recordHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.invocationRef, args.now)
  return result
}

async function projectRecoveryWithReconciliationInitialization(
  ctx: Parameters<typeof projectRecoveryHandler>[0],
  args: Parameters<typeof projectRecoveryHandler>[1],
): Promise<Awaited<ReturnType<typeof projectRecoveryHandler>>> {
  const result = await projectRecoveryHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.invocationRef, args.now)
  return result
}

async function claimDispatchWithReconciliationInitialization(
  ctx: Parameters<typeof claimDispatchHandler>[0],
  args: Parameters<typeof claimDispatchHandler>[1],
): Promise<Awaited<ReturnType<typeof claimDispatchHandler>>> {
  const result = await claimDispatchHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.dispatch.invocationRef, Date.now())
  return result
}

async function finalizeDispatchWithReconciliationInitialization(
  ctx: Parameters<typeof finalizeDispatchHandler>[0],
  args: Parameters<typeof finalizeDispatchHandler>[1],
): Promise<Awaited<ReturnType<typeof finalizeDispatchHandler>>> {
  const result = await finalizeDispatchHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.dispatch.invocationRef, Date.now())
  return result
}

async function cancelBeforeClaimWithReconciliationInitialization(
  ctx: Parameters<typeof cancelBeforeClaimHandler>[0],
  args: Parameters<typeof cancelBeforeClaimHandler>[1],
): Promise<Awaited<ReturnType<typeof cancelBeforeClaimHandler>>> {
  const result = await cancelBeforeClaimHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.invocationRef, Date.now())
  return result
}

async function completeWorkWithReconciliationInitialization(
  ctx: Parameters<typeof completeWorkHandler>[0],
  args: Parameters<typeof completeWorkHandler>[1],
): Promise<Awaited<ReturnType<typeof completeWorkHandler>>> {
  const authority = await reconcilePersistedInvocationAuthority(ctx, args.context.invocationRef, Date.now())
  const result = await completeWorkHandler(ctx, authority === null
    ? { ...args, result: { kind: 'failed', error: 'operation_invocation_authority_not_current' } }
    : args)
  await initializeReconciliationIfAbsent(ctx, args.context.invocationRef, Date.now())
  return result
}

async function listDueAutomaticReconciliationCandidatesHandler(
  ctx: QueryCtx,
  args: { now: number; limit: number },
): Promise<Infer<typeof reconciliationCandidateValue>[]> {
  if (!isFiniteNonNegative(args.now)) return []
  const limit = boundedCandidateLimit(args.limit)
  if (limit === 0) return []
  const rows = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_state_and_reconciliation_nextAttemptAt', (q) => (
      q.eq('state', 'reconciliation_required')
        .lte('reconciliation.nextAttemptAt', args.now)
    ))
    .order('asc')
    .take(limit)
  return rows.flatMap((row) => {
    const reconciliation = row.reconciliation
    if (
      !isValidInvocationReconciliation(reconciliation)
      || reconciliation.disposition !== 'automatic'
      || reconciliation.nextAttemptAt > args.now
    ) return []
    return [{
      invocationRef: row.invocationRef,
      attemptCount: reconciliation.attemptCount,
      nextAttemptAt: reconciliation.nextAttemptAt,
    }]
  })
}

async function claimAutomaticReconciliationCandidateHandler(
  ctx: MutationCtx,
  args: { invocationRef: string; leaseOwner: string; now: number },
): Promise<Infer<typeof reconciliationClaimResult>> {
  if (!isFiniteNonNegative(args.now) || !isBoundedLeaseOwner(args.leaseOwner)) return { kind: 'not_claimed' }
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
    .unique()
  const reconciliation = row?.reconciliation
  if (
    row === null
    || row.state !== 'reconciliation_required'
    || !isValidInvocationReconciliation(reconciliation)
    || reconciliation.disposition !== 'automatic'
    || reconciliation.nextAttemptAt > args.now
    || (
      reconciliation.leaseOwner !== undefined
      && reconciliation.leaseExpiresAt !== undefined
      && reconciliation.leaseExpiresAt > args.now
    )
  ) return { kind: 'not_claimed' }
  await ctx.db.patch(row._id, {
    reconciliation: {
      ...reconciliation,
      leaseOwner: args.leaseOwner,
      leaseExpiresAt: args.now + RECONCILIATION_LEASE_MS,
    },
    updatedAt: args.now,
  })
  return { kind: 'claimed', principalId: row.principalId, credentialId: row.credentialId }
}

async function finishAutomaticReconciliationHandler(
  ctx: MutationCtx,
  args: {
    invocationRef: string
    leaseOwner: string
    now: number
    outcome: Infer<typeof reconciliationFinishOutcome>
    reason?: ReconciliationReason
  },
): Promise<Infer<typeof reconciliationFinishResult>> {
  if (!isFiniteNonNegative(args.now) || !isBoundedLeaseOwner(args.leaseOwner)) {
    return { kind: 'refused', code: 'stale_lease' }
  }
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
    .unique()
  const reconciliation = row?.reconciliation
  if (row === null) return { kind: 'refused', code: 'not_found' }
  if (
    row.state !== 'reconciliation_required'
    || !isValidInvocationReconciliation(reconciliation)
    || reconciliation.disposition !== 'automatic'
    || reconciliation.leaseOwner !== args.leaseOwner
    || reconciliation.leaseExpiresAt === undefined
    || reconciliation.leaseExpiresAt <= args.now
  ) return { kind: 'refused', code: 'stale_lease' }
  if (args.outcome === 'success' || args.outcome === 'terminal') {
    await ctx.db.patch(row._id, { reconciliation: undefined, updatedAt: args.now })
    return { kind: 'completed' }
  }
  const attemptCount = reconciliation.attemptCount + 1
  const reason = args.outcome === 'error' ? 'recovery_failed' : args.reason ?? reconciliation.reason
  if (attemptCount >= RECONCILIATION_MAX_ATTEMPTS) {
    await ctx.db.patch(row._id, {
      reconciliation: {
        attemptCount,
        nextAttemptAt: args.now + RECONCILIATION_BACKOFF_MS[3],
        disposition: 'manual_review',
        reason,
      },
      updatedAt: args.now,
    })
    return { kind: 'manual_review' }
  }
  const backoffMs = attemptCount === 1
    ? RECONCILIATION_BACKOFF_MS[0]
    : attemptCount === 2
      ? RECONCILIATION_BACKOFF_MS[1]
      : attemptCount === 3
        ? RECONCILIATION_BACKOFF_MS[2]
        : RECONCILIATION_BACKOFF_MS[3]
  const nextAttemptAt = args.now + backoffMs
  await ctx.db.patch(row._id, {
    reconciliation: {
      attemptCount,
      nextAttemptAt,
      disposition: 'automatic',
      reason,
    },
    updatedAt: args.now,
  })
  return { kind: 'retried', attemptCount, nextAttemptAt }
}

const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(
  v.literal('inspect_only'),
  v.literal('approve_each'),
  v.literal('bounded_mandate'),
  v.literal('full_yolo'),
)
const principalValue = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
})
const providerLeaseAuthorityValue = v.object({
  connectionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  approvalDecisionRef: v.string(),
  approvalDecisionDigest: v.string(),
})
const dispatchState = v.union(
  v.literal('enqueued'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('reconciliation_required'),
)
const dispatchResult = v.union(
  v.object({ kind: v.literal('enqueued'), workId: v.string() }),
  v.object({ kind: v.literal('replayed'), workId: v.string() }),
  v.object({ kind: v.literal('refused') }),
)
const operationDispatchMutationResult = v.union(
  v.object({
    kind: v.union(v.literal('applied'), v.literal('duplicate')),
    attemptRef: v.string(),
    effectGeneration: v.number(),
  }),
  v.object({ kind: v.literal('claimed') }),
  v.object({ kind: v.literal('cancelled'), workId: v.optional(v.string()) }),
  v.object({ kind: v.literal('reconciliation_required'), attemptRef: v.string(), effectGeneration: v.number() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)
const approvalDecision = v.union(v.literal('approve'), v.literal('deny'))
const pendingApprovalView = v.object({
  invocationRef: v.string(),
  operationRef: v.string(),
  authorityRequest: v.object({
    kind: v.union(v.literal('approve_each'), v.literal('bounded_mandate')),
    operationRef: v.string(),
    consequence: v.union(v.literal('read_only'), v.literal('communication'), v.literal('external_effect')),
    retryClass: v.union(v.literal('replayable'), v.literal('attributable_retry'), v.literal('reconcile_before_retry')),
    maximumSpend: v.optional(v.object({ currency: v.string(), units: v.string(), exponent: v.number() })),
    dataFields: v.array(v.string()),
    expiresAt: v.optional(v.string()),
  }),
  createdAt: v.number(),
})
const approvalDecisionResult = v.union(
  v.object({ kind: v.union(v.literal('approved'), v.literal('denied'), v.literal('replayed')), invocationRef: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authentication_required'),
      v.literal('invocation_not_found'),
      v.literal('authority_not_pending'),
      v.literal('grant_not_current'),
      v.literal('invocation_invalid'),
    ),
  }),
)
const dispatchArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  operationRef: v.string(),
  authority: v.optional(operationInvokeAuthorityValue),
  now: v.number(),
} as const
const openDispatchValue = v.object({
  invocationRef: v.string(),
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
  operationRef: v.string(),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  requestDigest: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  policyDigest: v.string(),
  grantExpiresAt: v.number(),
  operationJson: v.string(),
  inputJson: v.string(),
  authority: v.optional(operationInvokeAuthorityValue),
  workId: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  dispatchState: v.optional(dispatchState),
})
const operationDispatchProjectionValue = v.object({
  state: v.union(v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required')),
  result: v.optional(operationResultValue),
  usage: v.optional(usageValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  dispatchState: v.union(v.literal('completed'), v.literal('failed'), v.literal('reconciliation_required')),
})
const operationDispatchMutationArgs = {
  dispatch: openDispatchValue,
  command: v.object(actionInvocationTransactArgs),
} as const
const cancelBeforeClaimArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  idempotencyKey: v.string(),
} as const
const finalizeDispatchArgs = {
  dispatch: openDispatchValue,
  command: v.object(actionInvocationTransactArgs),
  projection: operationDispatchProjectionValue,
} as const
export type OperationDispatchCommand = Infer<typeof operationDispatchMutationArgs.command>
export type OperationDispatchProjection = Infer<typeof operationDispatchProjectionValue>
const recordArgs = {
  invocationRef: v.string(), principalId: v.string(), state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
  result: v.optional(operationResultValue), usage: v.optional(usageValue), evidenceHash: v.optional(v.string()), attemptRef: v.optional(v.string()),
  dispatchState: v.optional(dispatchState), now: v.number(),
} as const
const replayValue = v.object({
  operationRef: v.string(),
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  result: v.optional(operationResultValue),
  usage: v.optional(usageValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
})
const recoveryValue = v.object({
  invocationRef: v.string(),
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  operationRef: v.string(),
  inputDigest: v.string(),
  requestDigest: v.string(),
  grantGeneration: v.number(),
  grantRef: v.string(),
  operationJson: v.string(),
  inputJson: v.string(),
  result: v.optional(operationResultValue),
  usage: v.optional(usageValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
})
const projectRecoveryArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  result: v.optional(operationResultValue),
  attemptRef: v.optional(v.string()),
  dispatchState: v.optional(dispatchState),
  clearResult: v.boolean(),
  clearWorkId: v.boolean(),
  clearAttemptRef: v.boolean(),
  clearEvidenceHash: v.boolean(),
  clearDispatchState: v.boolean(),
  now: v.number(),
} as const
const principalAndSourceArgs = {
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
  principal: principalValue,
} as const
const invokeArgs = {
  ...principalAndSourceArgs,
  operationRef: v.string(),
  input: jsonObject,
  idempotencyKey: v.string(),
} as const
const reserveArgs = {
  invocationRef: v.string(), principalId: v.string(), ownerId: v.string(), credentialId: v.string(),
  applicationRef: v.string(), grantRef: v.string(), environment, operationRef: v.string(), idempotencyKey: v.string(),
  inputDigest: v.string(), requestDigest: v.string(), grantGeneration: v.number(), policyDigest: v.string(), grantExpiresAt: v.number(),
  operationJson: v.optional(v.string()), inputJson: v.optional(v.string()), now: v.number(),
} as const
const reservationValue = v.object({
  principalId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  policyDigest: v.string(),
  grantExpiresAt: v.number(),
  environment,
  operationRef: v.string(),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  requestDigest: v.string(),
  invocationRef: v.string(),
})
const reserveRefusalCode = v.union(
  v.literal('grant_not_found'),
  v.literal('grant_revoked'),
  v.literal('grant_expired'),
  v.literal('grant_generation_stale'),
  v.literal('environment_mismatch'),
  v.literal('rate_limited'),
  v.literal('concurrency_limited'),
)
const reserveResult = v.union(
  v.object({ kind: v.literal('reserved'), reservation: reservationValue }),
  v.object({ kind: v.literal('replayed'), reservation: reservationValue }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('refused'), code: reserveRefusalCode, retryable: v.boolean(), nextAction: v.optional(v.string()) }),
)
const abandonArgs = {
  invocationRef: v.string(), principalId: v.string(), ownerId: v.string(), credentialId: v.string(),
  applicationRef: v.string(), grantRef: v.string(), environment, operationRef: v.string(), idempotencyKey: v.string(),
  inputDigest: v.string(), requestDigest: v.string(), grantGeneration: v.number(), policyDigest: v.string(), grantExpiresAt: v.number(),
} as const
const abandonResult = v.union(
  v.object({ kind: v.literal('abandoned') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('dispatch_started') }),
)
const workCompletionArgs = vOnCompleteArgs(v.object({ invocationRef: v.string() }))

type OperationPrincipal = Infer<typeof principalValue>
type CurrentAgentAuthority = Readonly<{
  principal: OperationPrincipal
  grantRef: string
  grantGeneration: number
  policyDigest: string
  expiresAt: number
}>

const reconciledInvocationAuthorityValue = v.object({
  principalId: v.string(),
  accountRef: v.string(),
  credentialId: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  policyDigest: v.string(),
  expiresAt: v.number(),
})
type ReconciledInvocationAuthority = Infer<typeof reconciledInvocationAuthorityValue>
const reconciledInvocationAuthorityResult = v.union(
  v.object({ kind: v.literal('authorized'), authority: reconciledInvocationAuthorityValue }),
  v.object({ kind: v.literal('refused') }),
)

const resolveInvocationAgentAuthorityRef = makeFunctionReference<
  'mutation',
  { principal: OperationPrincipal },
  OperationPrincipal | null
>('capabilityOperationInvocations:resolveInvocationAgentAuthority')

async function canonicalAgentPrincipal(
  ctx: ActionCtx,
  principal: OperationPrincipal,
): Promise<OperationPrincipal | null> {
  return await ctx.runMutation(resolveInvocationAgentAuthorityRef, { principal })
}

async function resolveCurrentAgentAuthority(
  ctx: MutationCtx,
  candidate: OperationPrincipal,
  now: number,
): Promise<CurrentAgentAuthority | null> {
  if (!Number.isSafeInteger(now)
    || now < 0
    || !candidate.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)) return null

  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', 'clerk/api-key')
      .eq('providerIdentifier', candidate.credentialId))
    .unique()
  if (binding === null
    || binding.lifecycle !== 'active'
    || binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'active'
    || !Number.isSafeInteger(binding.credentialGeneration)
    || binding.credentialGeneration < 0) return null

  const [credential, principal, storedAgent] = await Promise.all([
    ctx.db.query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
        .eq('bindingRef', binding.bindingRef)
        .eq('generation', binding.credentialGeneration)
        .eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
      .unique(),
    ctx.db.query('agentAccessPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', candidate.credentialId))
      .unique(),
  ])
  if (credential === null
    || credential.principalRef !== binding.principalRef
    || credential.type !== 'api_key'
    || credential.expiresAt <= now
    || principal === null
    || principal.kind !== 'agent'
    || principal.lifecycle !== 'active'
    || storedAgent === null
    || storedAgent.principalId !== principal.principalRef
    || storedAgent.credentialId !== candidate.credentialId
    || storedAgent.applicationRef !== candidate.applicationRef
    || storedAgent.environment !== candidate.environment
    || storedAgent.authorityMode !== candidate.authorityMode
    || storedAgent.lifecycle !== 'active'
    || (storedAgent.expiresAt !== undefined && storedAgent.expiresAt <= now)
    || !storedAgent.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
    || candidate.scopes.some((scope) => !storedAgent.scopes.includes(scope))) return null

  const activeGrants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
      .eq('credentialId', candidate.credentialId)
      .eq('environment', candidate.environment)
      .eq('lifecycle', 'active'))
    .take(2)
  if (activeGrants.length !== 1) return null
  const grant = activeGrants[0]!
  if (grant.principalId !== principal.principalRef
    || grant.ownerId !== storedAgent.ownerId
    || grant.applicationRef !== storedAgent.applicationRef
    || grant.authorityMode !== storedAgent.authorityMode
    || grant.generation !== storedAgent.grantGeneration
    || grant.policyDigest !== storedAgent.policyDigest
    || grant.expiresAt <= now) return null

  const [delegation, account] = await Promise.all([
    ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', grant.grantRef))
      .unique(),
    ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', storedAgent.ownerId))
      .unique(),
  ])
  if (delegation === null
    || delegation.lifecycle !== 'active'
    || delegation.subjectPrincipalRef !== principal.principalRef
    || delegation.accountRef !== storedAgent.ownerId
      || delegation.generation !== grant.generation
      || delegation.expiresAt <= now
      || !delegation.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
      || candidate.scopes.some((scope) => !delegation.scopes.includes(scope))
    || account === null
    || account.lifecycle !== 'active') return null

  return Object.freeze({
    principal: Object.freeze({
      principalId: principal.principalRef,
      ownerId: account.accountRef,
      credentialId: storedAgent.credentialId,
      applicationRef: storedAgent.applicationRef,
      environment: storedAgent.environment,
      scopes: [...candidate.scopes].sort(),
      authorityMode: storedAgent.authorityMode,
    }),
    grantRef: grant.grantRef,
    grantGeneration: grant.generation,
    policyDigest: grant.policyDigest,
    expiresAt: grant.expiresAt,
  })
}

async function validatePersistedInvocationDelegation(
  ctx: MutationCtx,
  input: Readonly<{
    invocationRef: string
    operationRef: string
    principalId: string
    accountRef: string
    grantRef: string
    grantGeneration: number
  }>,
): Promise<boolean> {
  try {
    const baseStore = createConvexDelegationStore(ctx)
    const readOnlyStore: DelegationStore = {
      transact: async (operation) => await baseStore.transact(
        async (transaction) => await operation({
          ...transaction,
          getSnapshotByAdmissionIdempotency: async () => undefined,
          getSnapshot: async () => undefined,
          commit: async () => undefined,
        }),
      ),
    }
    const evidenceRef = canonicalDigest({
      format: 'operation-workload-authority-validation:v1',
      invocationRef: input.invocationRef,
      operationRef: input.operationRef,
      principalId: input.principalId,
      accountRef: input.accountRef,
      grantRef: input.grantRef,
      grantGeneration: input.grantGeneration,
    } as StableHashValue)
    const snapshot = await new DelegationService(
      readOnlyStore,
      createConvexDelegationContextPort(ctx, principalRef(input.principalId)),
      { randomUuid: () => '00000000-0000-4000-8000-000000000001' },
    ).admitConsequence({
      grantRef: delegationGrantRef(input.grantRef),
      expectedGeneration: input.grantGeneration,
      context: {
        actorPrincipalRef: principalRef(input.principalId),
        activeAccountRef: accountRef(input.accountRef),
        correlationRef: evidenceRef,
        idempotencyRef: evidenceRef,
      },
      requiredScopes: [MARKET_OPERATIONS_INVOKE_SCOPE],
      resourceRefs: [input.operationRef],
      budgetAmount: 0,
    })
    return snapshot.actorPrincipalRef === input.principalId
      && snapshot.accountRef === input.accountRef
      && snapshot.grantRef === input.grantRef
      && snapshot.generation === input.grantGeneration
  } catch {
    return false
  }
}

async function reconcilePersistedInvocationAuthority(
  ctx: MutationCtx,
  invocationRef: string,
  now: number,
): Promise<ReconciledInvocationAuthority | null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .unique()
  if (row === null) return null
  const storedAgent = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', row.credentialId))
    .unique()
  if (storedAgent === null) return null
  const current = await resolveCurrentAgentAuthority(ctx, {
    principalId: storedAgent.principalId,
    ownerId: storedAgent.ownerId,
    credentialId: storedAgent.credentialId,
    applicationRef: storedAgent.applicationRef,
    environment: storedAgent.environment,
    scopes: storedAgent.scopes,
    authorityMode: storedAgent.authorityMode,
  }, now)
  if (current === null
    || row.principalId !== current.principal.principalId
    || row.ownerId !== current.principal.ownerId
    || row.credentialId !== current.principal.credentialId
    || row.applicationRef !== current.principal.applicationRef
    || row.environment !== current.principal.environment
    || row.grantRef !== current.grantRef
    || row.grantGeneration !== current.grantGeneration
    || row.policyDigest !== current.policyDigest
    || row.grantExpiresAt !== current.expiresAt
    || !await validatePersistedInvocationDelegation(ctx, {
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      principalId: current.principal.principalId,
      accountRef: current.principal.ownerId,
      grantRef: current.grantRef,
      grantGeneration: current.grantGeneration,
    })) return null
  return Object.freeze({
    principalId: current.principal.principalId,
    accountRef: current.principal.ownerId,
    credentialId: current.principal.credentialId,
    grantRef: current.grantRef,
    grantGeneration: current.grantGeneration,
    policyDigest: current.policyDigest,
    expiresAt: current.expiresAt,
  })
}

async function refuseInvocationBeforeEffectForInvalidAuthority(
  ctx: MutationCtx,
  invocationRef: string,
  now: number,
): Promise<void> {
  const [row, control] = await Promise.all([
    ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .unique(),
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .unique(),
  ])
  if (row === null || row.state !== 'pending' || control !== null) return
  await ctx.db.patch(row._id, {
    state: 'refused',
    dispatchState: 'failed',
    result: {
      kind: 'refused',
      operationRef: row.operationRef,
      code: 'grant_not_found',
      retryable: false,
      nextAction: 'Refresh the agent grant and retry.',
    },
    updatedAt: now,
  })
}

function agentRecoveryNotFound(invocationRef: string): Infer<typeof recoveryResultValue> {
  return { kind: 'refused', invocationRef, code: 'invocation_not_found', retryable: false }
}

function agentStatusNotFound(invocationRef: string): Infer<typeof statusResultValue> {
  return { kind: 'refused', invocationRef, code: 'invocation_not_found', retryable: false }
}

async function canonicalAgentInvokeHandler(
  ctx: ActionCtx,
  args: Parameters<typeof invokeHandler>[1],
): Promise<Infer<typeof operationResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal)
  if (principal === null) {
    return { kind: 'refused', operationRef: args.operationRef, code: 'grant_not_found', retryable: false }
  }
  return await invokeHandler(ctx, { ...args, principal })
}

async function canonicalAgentStatusHandler(
  ctx: ActionCtx,
  args: Parameters<typeof readInvocationStatusHandler>[1],
): Promise<Infer<typeof statusResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal)
  if (principal === null) return agentStatusNotFound(args.invocationRef)
  return await readInvocationStatusHandler(ctx, { ...args, principal })
}

async function canonicalAgentCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelInvocationHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal)
  if (principal === null) return agentRecoveryNotFound(args.invocationRef)
  return await cancelInvocationHandler(ctx, { ...args, principal })
}

async function canonicalAgentReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileInvocationHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal)
  if (principal === null) return agentRecoveryNotFound(args.invocationRef)
  return await reconcileInvocationHandler(ctx, { ...args, principal })
}

type CanonicalOwner = Extract<Awaited<ReturnType<typeof resolveBusinessActor>>, { kind: 'authenticated_owner' }>

async function canonicalOwnerContext<T extends QueryCtx | MutationCtx | ActionCtx>(
  ctx: T,
  actor: CanonicalOwner,
): Promise<T> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new Error('canonical_owner_identity_missing')
  const auth = new Proxy(ctx.auth, {
    get(target, property, receiver) {
      return property === 'getUserIdentity'
        ? async () => ({
            ...identity,
            subject: actor.canonicalPrincipalRef,
            tokenIdentifier: actor.canonicalAccountRef,
          })
        : Reflect.get(target, property, receiver)
    },
  })
  return new Proxy(ctx, {
    get(target, property, receiver) {
      return property === 'auth' ? auth : Reflect.get(target, property, receiver)
    },
  })
}

async function canonicalOwnerActor<T extends QueryCtx | MutationCtx | ActionCtx>(
  ctx: T,
): Promise<{ actor: CanonicalOwner; ctx: T } | null> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  return { actor, ctx: await canonicalOwnerContext(ctx, actor) }
}

async function canonicalOwnerApprovalListHandler(ctx: QueryCtx) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null ? [] : await listPendingOperationApprovalsHandler(canonical.ctx)
}

async function canonicalOwnerApprovalDecisionHandler(
  ctx: MutationCtx,
  args: Parameters<typeof decideOperationApprovalHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? { kind: 'refused' as const, code: 'authentication_required' as const }
    : await decideOperationApprovalHandler(canonical.ctx, args)
}

async function canonicalOwnerStatusHandler(
  ctx: ActionCtx,
  args: Parameters<typeof readOwnerInvocationStatusHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentStatusNotFound(args.invocationRef)
    : await readOwnerInvocationStatusHandler(canonical.ctx, args)
}

async function canonicalOwnerCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelOwnerInvocationHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.invocationRef)
    : await cancelOwnerInvocationHandler(canonical.ctx, args)
}

async function canonicalOwnerReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileOwnerInvocationHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.invocationRef)
    : await reconcileOwnerInvocationHandler(canonical.ctx, args)
}

export const resolveInvocationAgentAuthority = internalMutation({
  args: { principal: principalValue },
  returns: v.union(principalValue, v.null()),
  handler: async (ctx, args): Promise<OperationPrincipal | null> =>
    (await resolveCurrentAgentAuthority(ctx, args.principal, Date.now()))?.principal ?? null,
})

export const reconcileInvocationWorkloadAuthority = internalMutation({
  args: { invocationRef: v.string() },
  returns: reconciledInvocationAuthorityResult,
  handler: async (ctx, args) => {
    const now = Date.now()
    const authority = await reconcilePersistedInvocationAuthority(ctx, args.invocationRef, now)
    if (authority === null) {
      await refuseInvocationBeforeEffectForInvalidAuthority(ctx, args.invocationRef, now)
    }
    return authority === null
      ? { kind: 'refused' as const }
      : { kind: 'authorized' as const, authority }
  },
})

export const admit = internalMutation({
  args: { ...principalAndSourceArgs, operationRef: v.string(), input: jsonObject, idempotencyKey: v.string() },
  returns: v.object({ kind: v.literal('accepted') }),
  handler: admitHandler,
})

export const reserve = internalMutation({
  args: reserveArgs,
  returns: reserveResult,
  handler: reserveHandler,
})

export const abandon = internalMutation({
  args: abandonArgs,
  returns: abandonResult,
  handler: abandonHandler,
})

export const dispatch = internalMutation({
  args: dispatchArgs,
  returns: dispatchResult,
  handler: dispatchHandler,
})

export const claimDispatch = internalMutation({
  args: operationDispatchMutationArgs,
  returns: operationDispatchMutationResult,
  handler: claimDispatchWithReconciliationInitialization,
})

export const finalizeDispatch = internalMutation({
  args: finalizeDispatchArgs,
  returns: operationDispatchMutationResult,
  handler: finalizeDispatchWithReconciliationInitialization,
})

export const cancelBeforeClaim = internalMutation({
  args: cancelBeforeClaimArgs,
  returns: operationDispatchMutationResult,
  handler: cancelBeforeClaimWithReconciliationInitialization,
})

export const listPendingOperationApprovals = query({
  args: {},
  returns: v.array(pendingApprovalView),
  handler: canonicalOwnerApprovalListHandler,
})

export const decideOperationApproval = mutation({
  args: { invocationRef: v.string(), decision: approvalDecision },
  returns: approvalDecisionResult,
  handler: canonicalOwnerApprovalDecisionHandler,
})

export const openDispatch = internalQuery({
  args: { invocationRef: v.string() },
  returns: v.union(openDispatchValue, v.null()),
  handler: openDispatchHandler,
})

export const readReplay = internalQuery({
  args: { invocationRef: v.string(), principalId: v.string(), credentialId: v.string() },
  returns: v.union(replayValue, v.null()),
  handler: readReplayHandler,
})

export const readRecovery = internalQuery({
  args: { invocationRef: v.string(), principalId: v.string(), credentialId: v.string() },
  returns: v.union(recoveryValue, v.null()),
  handler: readRecoveryHandler,
})

export const readOwnerRecovery = internalQuery({
  args: { invocationRef: v.string() },
  returns: v.union(recoveryValue, v.null()),
  handler: readOwnerRecoveryHandler,
})

export const record = internalMutation({
  args: recordArgs,
  returns: v.object({ kind: v.literal('recorded') }),
  handler: recordWithReconciliationInitialization,
})

export const projectRecovery = internalMutation({
  args: projectRecoveryArgs,
  returns: v.object({ kind: v.literal('recorded') }),
  handler: projectRecoveryWithReconciliationInitialization,
})

export const listDueAutomaticReconciliationCandidates = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(reconciliationCandidateValue),
  handler: listDueAutomaticReconciliationCandidatesHandler,
})

export const claimAutomaticReconciliationCandidate = internalMutation({
  args: { invocationRef: v.string(), leaseOwner: v.string(), now: v.number() },
  returns: reconciliationClaimResult,
  handler: claimAutomaticReconciliationCandidateHandler,
})

export const finishAutomaticReconciliation = internalMutation({
  args: {
    invocationRef: v.string(),
    leaseOwner: v.string(),
    now: v.number(),
    outcome: reconciliationFinishOutcome,
    reason: v.optional(reconciliationReason),
  },
  returns: reconciliationFinishResult,
  handler: finishAutomaticReconciliationHandler,
})

export const readProviderLeaseAuthority = internalQuery({
  args: { connectionRef: v.string(), authorityGeneration: v.number() },
  returns: v.union(providerLeaseAuthorityValue, v.null()),
  handler: readProviderLeaseAuthorityHandler,
})

export const completeWork = internalMutation({
  args: workCompletionArgs,
  returns: v.null(),
  handler: completeWorkWithReconciliationInitialization,
})

export const invoke = action({
  args: invokeArgs,
  returns: operationResultValue,
  handler: canonicalAgentInvokeHandler,
})

export const readInvocationStatus = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string() },
  returns: statusResultValue,
  handler: canonicalAgentStatusHandler,
})

export const cancelInvocation = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: canonicalAgentCancelHandler,
})

export const reconcileInvocation = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string(), idempotencyKey: v.string(), evidence: reconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: canonicalAgentReconcileHandler,
})

export const readOwnerInvocationStatus = action({
  args: { invocationRef: v.string() },
  returns: statusResultValue,
  handler: canonicalOwnerStatusHandler,
})

export const cancelOwnerInvocation = action({
  args: { invocationRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: canonicalOwnerCancelHandler,
})

export const reconcileOwnerInvocation = action({
  args: { invocationRef: v.string(), idempotencyKey: v.string(), evidence: reconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: canonicalOwnerReconcileHandler,
})
