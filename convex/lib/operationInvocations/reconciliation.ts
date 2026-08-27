import { v, type Infer } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { invocationReconciliationValue } from '@/modules/capability-execution/convex'
import {
  cancelBeforeClaimHandler,
  claimDispatchHandler,
  finalizeDispatchHandler,
} from './dispatch'
import { completeWorkHandler } from './workComplete'
import { projectRecoveryHandler, recordHandler } from './invokeActions'
import { reconcilePersistedInvocationAuthority } from './authorityHandlers'

const RECONCILIATION_MAX_CANDIDATES = 25
const RECONCILIATION_LEASE_MS = 60_000
const RECONCILIATION_MAX_ATTEMPTS = 5
const RECONCILIATION_LEASE_OWNER_MAX_LENGTH = 200
const RECONCILIATION_BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000] as const
type InvocationReconciliation = Infer<typeof invocationReconciliationValue>
type ReconciliationReason = InvocationReconciliation['reason']
type InvocationRow = Doc<'capabilityOperationInvocations'>

const RECONCILIATION_REASONS = new Set<ReconciliationReason>([
  'unknown_settlement',
  'pending_accounting',
  'refund_pending',
  'custody_cap',
  'recovery_failed',
  'authorization_expired',
])

export const reconciliationReason = v.union(
  v.literal('unknown_settlement'),
  v.literal('pending_accounting'),
  v.literal('refund_pending'),
  v.literal('custody_cap'),
  v.literal('recovery_failed'),
  v.literal('authorization_expired'),
)
export const reconciliationCandidateValue = v.object({
  invocationRef: v.string(),
  attemptCount: v.number(),
  nextAttemptAt: v.number(),
})
export const reconciliationClaimResult = v.union(
  v.object({ kind: v.literal('claimed'), principalId: v.string(), credentialId: v.string() }),
  v.object({ kind: v.literal('not_claimed') }),
)
export const reconciliationFinishResult = v.union(
  v.object({ kind: v.literal('completed') }),
  v.object({ kind: v.literal('retried'), attemptCount: v.number(), nextAttemptAt: v.number() }),
  v.object({ kind: v.literal('manual_review') }),
  v.object({ kind: v.literal('refused'), code: v.union(v.literal('not_found'), v.literal('not_claimed'), v.literal('stale_lease')) }),
)
export const reconciliationFinishOutcome = v.union(
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
  if (value === undefined) return false
  return [
    Number.isSafeInteger(value.attemptCount),
    value.attemptCount >= 0,
    isFiniteNonNegative(value.nextAttemptAt),
    value.leaseOwner === undefined || isBoundedLeaseOwner(value.leaseOwner),
    value.leaseExpiresAt === undefined || isFiniteNonNegative(value.leaseExpiresAt),
    value.disposition === 'automatic' || value.disposition === 'manual_review',
    RECONCILIATION_REASONS.has(value.reason),
  ].every(Boolean)
}

function hasClaimableReconciliation(
  row: InvocationRow | null,
  now: number,
): row is InvocationRow & { reconciliation: InvocationReconciliation } {
  const reconciliation = row?.reconciliation
  if (row === null || !isValidInvocationReconciliation(reconciliation)) return false
  const leaseAvailable = reconciliation.leaseOwner === undefined
    || reconciliation.leaseExpiresAt === undefined
    || reconciliation.leaseExpiresAt <= now
  return [
    row.state === 'reconciliation_required',
    reconciliation.disposition === 'automatic',
    reconciliation.nextAttemptAt <= now,
    leaseAvailable,
  ].every(Boolean)
}

function hasCurrentAutomaticLease(
  row: InvocationRow,
  reconciliation: InvocationReconciliation | undefined,
  leaseOwner: string,
  now: number,
): reconciliation is InvocationReconciliation {
  if (!isValidInvocationReconciliation(reconciliation)) return false
  return [
    row.state === 'reconciliation_required',
    reconciliation.disposition === 'automatic',
    reconciliation.leaseOwner === leaseOwner,
    reconciliation.leaseExpiresAt !== undefined,
    (reconciliation.leaseExpiresAt ?? 0) > now,
  ].every(Boolean)
}

type FinishDecision =
  | Readonly<{ kind: 'completed' }>
  | Readonly<{ kind: 'manual_review'; reconciliation: InvocationReconciliation }>
  | Readonly<{ kind: 'retried'; reconciliation: InvocationReconciliation }>

function reconciliationBackoff(attemptCount: number): number {
  return RECONCILIATION_BACKOFF_MS[Math.min(Math.max(attemptCount - 1, 0), 3)]
    ?? RECONCILIATION_BACKOFF_MS[3]
}

function decideReconciliationFinish(
  current: InvocationReconciliation,
  args: Readonly<{
    now: number
    outcome: Infer<typeof reconciliationFinishOutcome>
    reason?: ReconciliationReason
  }>,
): FinishDecision {
  if (args.outcome === 'success' || args.outcome === 'terminal') return { kind: 'completed' }
  const attemptCount = current.attemptCount + 1
  const reason = args.outcome === 'error' ? 'recovery_failed' : args.reason ?? current.reason
  const nextAttemptAt = args.now + reconciliationBackoff(attemptCount)
  if (attemptCount >= RECONCILIATION_MAX_ATTEMPTS) {
    return {
      kind: 'manual_review',
      reconciliation: { attemptCount, nextAttemptAt, disposition: 'manual_review', reason },
    }
  }
  return {
    kind: 'retried',
    reconciliation: { attemptCount, nextAttemptAt, disposition: 'automatic', reason },
  }
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

export async function initializeReconciliationIfAbsent(
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

export async function recordWithReconciliationInitialization(
  ctx: Parameters<typeof recordHandler>[0],
  args: Parameters<typeof recordHandler>[1],
): Promise<Awaited<ReturnType<typeof recordHandler>>> {
  const result = await recordHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.invocationRef, args.now)
  return result
}

export async function projectRecoveryWithReconciliationInitialization(
  ctx: Parameters<typeof projectRecoveryHandler>[0],
  args: Parameters<typeof projectRecoveryHandler>[1],
): Promise<Awaited<ReturnType<typeof projectRecoveryHandler>>> {
  const result = await projectRecoveryHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.invocationRef, args.now)
  return result
}

export async function claimDispatchWithReconciliationInitialization(
  ctx: Parameters<typeof claimDispatchHandler>[0],
  args: Parameters<typeof claimDispatchHandler>[1],
): Promise<Awaited<ReturnType<typeof claimDispatchHandler>>> {
  const result = await claimDispatchHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.dispatch.invocationRef, Date.now())
  return result
}

export async function finalizeDispatchWithReconciliationInitialization(
  ctx: Parameters<typeof finalizeDispatchHandler>[0],
  args: Parameters<typeof finalizeDispatchHandler>[1],
): Promise<Awaited<ReturnType<typeof finalizeDispatchHandler>>> {
  const result = await finalizeDispatchHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.dispatch.invocationRef, Date.now())
  return result
}

export async function cancelBeforeClaimWithReconciliationInitialization(
  ctx: Parameters<typeof cancelBeforeClaimHandler>[0],
  args: Parameters<typeof cancelBeforeClaimHandler>[1],
): Promise<Awaited<ReturnType<typeof cancelBeforeClaimHandler>>> {
  const result = await cancelBeforeClaimHandler(ctx, args)
  await initializeReconciliationIfAbsent(ctx, args.invocationRef, Date.now())
  return result
}

export async function completeWorkWithReconciliationInitialization(
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

export async function listDueAutomaticReconciliationCandidatesHandler(
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

export async function claimAutomaticReconciliationCandidateHandler(
  ctx: MutationCtx,
  args: { invocationRef: string; leaseOwner: string; now: number },
): Promise<Infer<typeof reconciliationClaimResult>> {
  if (!isFiniteNonNegative(args.now) || !isBoundedLeaseOwner(args.leaseOwner)) return { kind: 'not_claimed' }
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
    .unique()
  if (!hasClaimableReconciliation(row, args.now)) return { kind: 'not_claimed' }
  const reconciliation = row.reconciliation
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

export async function finishAutomaticReconciliationHandler(
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
  if (row === null) return { kind: 'refused', code: 'not_found' }
  const reconciliation = row.reconciliation
  if (!hasCurrentAutomaticLease(row, reconciliation, args.leaseOwner, args.now)) {
    return { kind: 'refused', code: 'stale_lease' }
  }
  const decision = decideReconciliationFinish(reconciliation, args)
  if (decision.kind === 'completed') {
    await ctx.db.patch(row._id, { reconciliation: undefined, updatedAt: args.now })
    return decision
  }
  await ctx.db.patch(row._id, { reconciliation: decision.reconciliation, updatedAt: args.now })
  return decision.kind === 'manual_review'
    ? { kind: 'manual_review' }
    : {
        kind: 'retried',
        attemptCount: decision.reconciliation.attemptCount,
        nextAttemptAt: decision.reconciliation.nextAttemptAt,
      }
}
