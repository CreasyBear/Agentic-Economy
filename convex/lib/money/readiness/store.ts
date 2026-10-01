import { verifyCustomerRequestServiceAssertion, type CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import { v, type Infer } from 'convex/values'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { deploymentPaymentEnvironment, type PaymentEnvironment } from '@/lib/deployment/environment'
import { backendPaymentReadinessDigest, failedPaymentReadinessChecks, PAYMENT_READINESS_CHECK_KEYS,
  PAYMENT_READINESS_MAX_PROBE_AGE_MS, validPaymentReadinessSnapshot,
  type PaymentReadinessSnapshot, type PaymentReadinessView } from '@/modules/money/payment-readiness'

export const publishPaymentReadinessResultValue = v.union(
  v.object({ kind: v.literal('published'), replayed: v.boolean() }),
  v.object({ kind: v.literal('refused'), code: v.union(
    v.literal('readiness_environment_mismatch'), v.literal('readiness_configuration_changed'),
    v.literal('readiness_snapshot_invalid'), v.literal('readiness_snapshot_stale'), v.literal('readiness_snapshot_superseded'),
  ) }),
)
export type PublishPaymentReadinessResult = Infer<typeof publishPaymentReadinessResultValue>

/**
 * Requires complete, unexpired evidence for the current environment/configuration.
 * Ensures transactional exact replay and monotonic publication by probe start.
 * Invariant: one bounded row per environment; a late worker cannot restore old green evidence.
 * On violation: typed refusal with no writes, including stale/future/rotated configuration.
 * Cost: one fixed contract + one indexed row replaces divergent UI/admission freshness logic.
 * Keep: existing treasury evidence remains its own source; no history or workflow framework.
 */
export async function publishPaymentReadiness(
  ctx: MutationCtx, args: { snapshot: PaymentReadinessSnapshot },
): Promise<PublishPaymentReadinessResult> {
  const snapshot = args.snapshot
  const now = Date.now()
  if (deploymentPaymentEnvironment(env) !== snapshot.environment) return { kind: 'refused', code: 'readiness_environment_mismatch' }
  if (!validPaymentReadinessSnapshot(snapshot, now)) return { kind: 'refused', code: 'readiness_snapshot_invalid' }
  if (snapshot.configurationDigest !== backendPaymentReadinessDigest(env)) return { kind: 'refused', code: 'readiness_configuration_changed' }
  if (now - snapshot.startedAt > PAYMENT_READINESS_MAX_PROBE_AGE_MS || now >= snapshot.expiresAt) {
    return { kind: 'refused', code: 'readiness_snapshot_stale' }
  }
  const current = await ctx.db.query('moneyPaymentReadiness')
    .withIndex('by_environment', q => q.eq('environment', snapshot.environment)).unique()
  if (current?.evidenceDigest === snapshot.evidenceDigest) return { kind: 'published', replayed: true }
  if (current !== null && current.startedAt >= snapshot.startedAt) return { kind: 'refused', code: 'readiness_snapshot_superseded' }
  if (current === null) await ctx.db.insert('moneyPaymentReadiness', snapshot)
  else await ctx.db.replace(current._id, snapshot)
  return { kind: 'published', replayed: false }
}

/**
 * Requires the admission's server timestamp (or an explicit query observation timestamp).
 * Ensures only fresh current-config complete passing checks can return ready.
 * Invariant: snapshot/credential digests and raw configuration never enter the view.
 * On violation: not_ready with bounded failed checks; no writes or fabricated pass.
 */
export async function readPaymentReadiness(
  ctx: Pick<QueryCtx, 'db'>, environment: PaymentEnvironment, now: number,
): Promise<PaymentReadinessView> {
  const unavailable = (code: string): PaymentReadinessView => ({ kind: 'not_ready', environment,
    checkedAt: null, expiresAt: null, code, checks: failedPaymentReadinessChecks(code) })
  if (!Number.isSafeInteger(now) || now < 0) return unavailable('readiness_clock_invalid')
  if (deploymentPaymentEnvironment(env) !== environment) return unavailable('readiness_environment_mismatch')
  const snapshot = await ctx.db.query('moneyPaymentReadiness')
    .withIndex('by_environment', q => q.eq('environment', environment)).unique()
  if (snapshot === null) return unavailable('readiness_evidence_missing')
  const { _id, _creationTime, ...evidence } = snapshot
  void _id; void _creationTime
  if (!validPaymentReadinessSnapshot(evidence, now)) return unavailable('readiness_snapshot_invalid')
  if (evidence.configurationDigest !== backendPaymentReadinessDigest(env)) return unavailable('readiness_configuration_changed')
  if (now >= evidence.expiresAt) return { ...unavailable('readiness_expired'),
    checkedAt: evidence.completedAt, expiresAt: evidence.expiresAt }
  const firstFailure = PAYMENT_READINESS_CHECK_KEYS.map(key => evidence.checks[key])
    .find(check => check.kind === 'failed' || check.validUntil <= now)
  return { kind: firstFailure === undefined ? 'ready' : 'not_ready', environment,
    checkedAt: evidence.completedAt, expiresAt: evidence.expiresAt,
    code: firstFailure === undefined ? null : firstFailure.kind === 'failed' ? firstFailure.code : 'readiness_expired',
    checks: evidence.checks }
}

/** Signed service read: authenticate before any store access; time is backend-owned. */
export async function readPaymentReadinessForServer(
  ctx: Pick<QueryCtx, 'db'>,
  args: { environment: PaymentEnvironment; serviceAuth: CustomerRequestServiceAssertion },
): Promise<PaymentReadinessView> {
  const assertion = args.serviceAuth
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32 || assertion.principalId !== 'ae:server-function'
    || assertion.ownerId !== 'ae:server-function' || assertion.credentialId !== 'ae:server-function'
    || !assertion.scopes.includes('money_readiness:read')
    || !await verifyCustomerRequestServiceAssertion({ key, operation: 'moneyReadiness:readForServer',
      command: { environment: args.environment }, assertion })) throw new Error('authentication_required')
  return await readPaymentReadiness(ctx, args.environment, Date.now())
}
