import { vOnCompleteArgs } from '@convex-dev/workpool'
import { v, type Infer } from 'convex/values'
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { sourceWriteArgs } from './sourceWriteAdmission'
import { actionInvocationTransactArgs } from './actionInvocationControl'
import { invocationReconciliationValue } from '@/modules/capability-execution/internal/convex-schema'
import {
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
  const result = await completeWorkHandler(ctx, args)
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
        nextAttemptAt: args.now + RECONCILIATION_BACKOFF_MS[RECONCILIATION_BACKOFF_MS.length - 1]!,
        disposition: 'manual_review',
        reason,
      },
      updatedAt: args.now,
    })
    return { kind: 'manual_review' }
  }
  const nextAttemptAt = args.now + RECONCILIATION_BACKOFF_MS[attemptCount - 1]!
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
  handler: listPendingOperationApprovalsHandler,
})

export const decideOperationApproval = mutation({
  args: { invocationRef: v.string(), decision: approvalDecision },
  returns: approvalDecisionResult,
  handler: decideOperationApprovalHandler,
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
  handler: invokeHandler,
})

export const readInvocationStatus = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string() },
  returns: statusResultValue,
  handler: readInvocationStatusHandler,
})

export const cancelInvocation = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: cancelInvocationHandler,
})

export const reconcileInvocation = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string(), idempotencyKey: v.string(), evidence: reconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: reconcileInvocationHandler,
})

export const readOwnerInvocationStatus = action({
  args: { invocationRef: v.string() },
  returns: statusResultValue,
  handler: readOwnerInvocationStatusHandler,
})

export const cancelOwnerInvocation = action({
  args: { invocationRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: cancelOwnerInvocationHandler,
})

export const reconcileOwnerInvocation = action({
  args: { invocationRef: v.string(), idempotencyKey: v.string(), evidence: reconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: reconcileOwnerInvocationHandler,
})
