import type { Doc } from '../../../_generated/dataModel'
import { internal } from '../../../_generated/api'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'

/** First watchdog hop after a paid-response checkpoint; only this hop is fast. */
export const RESPONSE_RECOVERY_FIRST_DELAY_MS = 15_000
/** Retry backoff doubles from here, so manual review stays about 15 minutes after checkpoint. */
const RESPONSE_RECOVERY_BACKOFF_BASE_MS = 60_000
/** A retry lease outlives its scheduled successor so the next attempt can take it over. */
const RESPONSE_RECOVERY_LEASE_GRACE_MS = 60_000

/** The permanent refund fence belongs to this retained payment, never a new effect. */
async function isExactHttpErrorRemedy(ctx: Pick<QueryCtx, 'db'>, row: Doc<'capabilityCalls'>): Promise<boolean> {
  const owner = row.reconciliation?.leaseOwner
  const prefix = 'paid-result-loss:http-error:'
  if (owner === undefined || !owner.startsWith(prefix) || row.result?.kind !== 'reconciliation_required') return false
  const transactionHash = owner.slice(prefix.length)
  if (!/^0x[0-9a-f]{64}$/.test(transactionHash)) return false
  const { attemptRef, effectGeneration } = row.result.evidence
  const payment = await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', attemptRef).eq('effectGeneration', effectGeneration)).unique()
  return payment !== null && payment.dispatchRef === row.callRef
    && payment.toolRef === row.toolRef && payment.inputDigest === row.inputDigest
    && payment.responseStatus !== undefined && Number.isInteger(payment.responseStatus)
    && payment.responseStatus >= 300 && payment.responseStatus <= 599
    && payment.evidenceRefs.some(ref => ref.toLowerCase() === `chain:${payment.network}:${transactionHash}`)
}

/** Schedule effect and successor atomically, including a crash before action entry. */
export async function beginResponseRecoveryHandler(ctx: MutationCtx, args: { callRef: string; attempt: number }): Promise<boolean> {
  if (!Number.isInteger(args.attempt) || args.attempt < 0 || args.attempt > 4) return false
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
  if (row === null || (row.state !== 'pending' && row.state !== 'reconciliation_required')) return false
  // A restored manual settlement hold cannot be turned into automatic work by
  // an old watchdog. Refusal is read-only, including repeated/concurrent calls.
  if (row.state === 'reconciliation_required'
    && row.reconciliation?.disposition === 'manual_review'
    && row.reconciliation.reason === 'unknown_settlement') return false
  const owner = row.reconciliation?.leaseOwner
  const httpErrorRemedy = await isExactHttpErrorRemedy(ctx, row)
  const ownStep = httpErrorRemedy ? (row.reconciliation?.attemptCount ?? 0) - 1
    : owner?.startsWith('paid-response:') ? Number(owner.slice('paid-response:'.length)) : -1
  if (ownStep >= args.attempt) return false
  if (!httpErrorRemedy && owner !== undefined && ownStep < 0
    && (row.reconciliation?.leaseExpiresAt ?? 0) > Date.now()) {
    // A status sweep owns no payment effect; wait for it without losing this watchdog.
    if (owner.startsWith('reconciliation-sweep:') && row.reconciliation !== undefined) {
      const resumeAt = row.reconciliation.leaseExpiresAt! + 1
      if (row.reconciliation.nextAttemptAt !== resumeAt) {
        await ctx.db.patch(row._id, { reconciliation: { ...row.reconciliation, nextAttemptAt: resumeAt } })
        await ctx.scheduler.runAt(resumeAt, internal.moneyX402PaymentAttempts.beginResponseRecovery, args)
      }
    }
    return false
  }
  const nextAt = Date.now() + RESPONSE_RECOVERY_BACKOFF_BASE_MS * 2 ** args.attempt
  await ctx.db.patch(row._id, { reconciliation: {
    disposition: args.attempt === 4 ? 'manual_review' : 'automatic',
    reason: httpErrorRemedy ? 'refund_pending' : 'recovery_failed', attemptCount: args.attempt + 1, nextAttemptAt: nextAt,
    // Preserve the permanent money fence while only advancing the watchdog.
    leaseOwner: httpErrorRemedy ? owner! : `paid-response:${args.attempt}`,
    leaseExpiresAt: httpErrorRemedy ? Number.MAX_SAFE_INTEGER : nextAt + RESPONSE_RECOVERY_LEASE_GRACE_MS,
  } })
  if (args.attempt < 4) {
    await ctx.scheduler.runAt(nextAt, internal.moneyX402PaymentAttempts.beginResponseRecovery, {
      callRef: args.callRef, attempt: args.attempt + 1,
    })
    await ctx.scheduler.runAfter(0, internal.moneyX402ResponseActions.recover, args)
  }
  return args.attempt < 4
}

/** Read-only fence: an obsolete scheduled action cannot restart exhausted recovery. */
export async function responseRecoveryIsCurrentHandler(ctx: QueryCtx, args: { callRef: string; attempt: number }): Promise<boolean> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
  return row !== null && (row.state === 'pending' || row.state === 'reconciliation_required')
    && row.reconciliation?.disposition === 'automatic'
    && (row.reconciliation.leaseOwner === `paid-response:${args.attempt}`
      || (row.reconciliation.attemptCount === args.attempt + 1 && await isExactHttpErrorRemedy(ctx, row)))
}
