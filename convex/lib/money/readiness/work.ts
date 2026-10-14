import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deploymentPaymentEnvironment, type PaymentEnvironment } from '@/lib/deployment/environment'
import { backendPaymentReadinessDigest, type PaymentReadinessSnapshot } from '@/modules/money/payment-readiness'
import type { PaymentReadinessWork, PaymentReadinessClaim } from '@/modules/money/payment-readiness'
import { internal } from '../../../_generated/api'
import { env, type MutationCtx } from '../../../_generated/server'
import { configuredTreasuryIdentity } from '../treasury/progress'
import { readLatestTreasurySnapshot, readTreasuryPaymentReadinessCheck } from '../treasury/health'
import { publishPaymentReadiness, readPaymentReadiness, type PublishPaymentReadinessResult } from './store'

const WINDOW_MS = 5 * 60_000
const LEASE_MS = 90_000
const MAX_ATTEMPTS = 2
type Refused = { kind: 'refused'; code: string }
type WorkRow = PaymentReadinessWork & { _id: import('../../../_generated/dataModel').Id<'moneyPaymentReadinessWork'> }

function custodyDigest(): string {
  const identity = configuredTreasuryIdentity()
  return identity === undefined ? 'unconfigured' : canonicalDigest(identity)
}
function initial(environment: PaymentEnvironment, now: number): PaymentReadinessWork {
  return { environment, generation: 0, requestedVersion: 0, completedVersion: 0,
    windowStartedAt: Math.floor(now / WINDOW_MS) * WINDOW_MS, attemptsInWindow: 0, job: { kind: 'idle' } }
}
function valid(work: PaymentReadinessWork, now: number): boolean {
  const job = work.job
  const digest = (value: string) => /^sha256:[a-f0-9]{64}$/u.test(value)
  if (job.kind !== 'idle' && (!digest(job.token) || !Number.isSafeInteger(job.leaseUntil)
    || job.leaseUntil < 0 || job.leaseUntil > now + LEASE_MS || work.generation < 1 || work.attemptsInWindow < 1)) return false
  if (job.kind === 'running' && (!Number.isSafeInteger(job.claimedVersion) || job.claimedVersion < work.completedVersion
    || job.claimedVersion > work.requestedVersion || !Number.isSafeInteger(job.claimedAt) || job.claimedAt < 0
    || job.claimedAt > now || job.leaseUntil !== job.claimedAt + LEASE_MS || !digest(job.configurationDigest)
    || (job.custodyDigest !== 'unconfigured' && !digest(job.custodyDigest)))) return false
  return [work.generation, work.requestedVersion, work.completedVersion, work.windowStartedAt, work.attemptsInWindow]
    .every(value => Number.isSafeInteger(value) && value >= 0)
    && work.completedVersion <= work.requestedVersion && work.windowStartedAt <= now
    && work.attemptsInWindow <= MAX_ATTEMPTS
}
function token(work: PaymentReadinessWork, now: number): string {
  return canonicalDigest({ format: 'ae.readiness-work:v1', environment: work.environment,
    generation: work.generation + 1, issuedAt: now })
}
async function stored(ctx: MutationCtx, environment: PaymentEnvironment): Promise<WorkRow | null> {
  return await ctx.db.query('moneyPaymentReadinessWork').withIndex('by_environment', q => q.eq('environment', environment)).unique()
}
async function save(ctx: MutationCtx, previous: WorkRow | null, work: PaymentReadinessWork): Promise<void> {
  if (previous === null) await ctx.db.insert('moneyPaymentReadinessWork', work)
  else await ctx.db.replace(previous._id, work)
}
function material(row: WorkRow): PaymentReadinessWork {
  return { environment: row.environment, generation: row.generation, requestedVersion: row.requestedVersion,
    completedVersion: row.completedVersion, windowStartedAt: row.windowStartedAt,
    attemptsInWindow: row.attemptsInWindow, job: row.job }
}
async function queue(ctx: MutationCtx, work: PaymentReadinessWork, now: number): Promise<PaymentReadinessWork> {
  const queued: PaymentReadinessWork = { ...work, generation: work.generation + 1,
    attemptsInWindow: work.attemptsInWindow + 1, job: { kind: 'queued', token: token(work, now), leaseUntil: now + LEASE_MS } }
  if (queued.job.kind !== 'queued') throw new Error('readiness_queue_invariant')
  await ctx.scheduler.runAfter(0, internal.moneyReadinessRefresh.recover, {
    environment: work.environment, token: queued.job.token,
  })
  return queued
}

/**
 * Requires a current matched snapshot and admitted treasury workload authority.
 * Ensures one queued recovery per environment and preserves newer demand during I/O.
 * Invariant: requests never renew a live lease/reset its attempt allowance or touch money.
 * On violation: named refusal; watchdog retains responsibility for abandoned work.
 * Cost: one bounded coordination row isolates job state from sealed evidence.
 */
export async function requestPaymentReadinessRecovery(ctx: MutationCtx, args: { snapshotRef: string }): Promise<{ kind: 'requested' } | Refused> {
  const now = Date.now()
  const environment = deploymentPaymentEnvironment(env)
  const identity = configuredTreasuryIdentity()
  if (environment === undefined || identity === undefined || identity.environment !== environment) return { kind: 'refused', code: 'readiness_environment_mismatch' }
  const latest = await readLatestTreasurySnapshot(ctx, identity)
  if (latest === null || latest.snapshotRef !== args.snapshotRef
    || (await readTreasuryPaymentReadinessCheck(ctx, environment, now)).kind !== 'passed') {
    return { kind: 'refused', code: 'readiness_treasury_changed' }
  }
  const previous = await stored(ctx, environment)
  let work = previous === null ? initial(environment, now) : material(previous)
  if (!valid(work, now)) return { kind: 'refused', code: 'readiness_work_invalid' }
  const active = work.job.kind !== 'idle' && work.job.leaseUntil > now
  const readiness = await readPaymentReadiness(ctx, environment, now)
  if (readiness.kind === 'ready' && !active) return { kind: 'refused', code: 'readiness_already_ready' }
  if (latest.snapshotAt <= work.requestedVersion) return { kind: 'requested' }
  work = { ...work, requestedVersion: latest.snapshotAt }
  if (!active && readiness.kind !== 'ready' && work.attemptsInWindow < MAX_ATTEMPTS) work = await queue(ctx, work, now)
  await save(ctx, previous, work)
  return { kind: 'requested' }
}

/** Exact claim prevents duplicate provider I/O; a periodic watchdog can replace expired queued/running work. */
export async function claimPaymentReadinessWork(ctx: MutationCtx, args: {
  environment: PaymentEnvironment; token?: string
}): Promise<PaymentReadinessClaim | Refused> {
  const now = Date.now()
  if (deploymentPaymentEnvironment(env) !== args.environment) return { kind: 'refused', code: 'readiness_environment_mismatch' }
  const previous = await stored(ctx, args.environment)
  let work = previous === null ? initial(args.environment, now) : material(previous)
  if (!valid(work, now)) return { kind: 'refused', code: 'readiness_work_invalid' }
  let nextToken: string
  if (args.token !== undefined) {
    if (work.job.kind !== 'queued' || work.job.token !== args.token || work.job.leaseUntil <= now) {
      return { kind: 'refused', code: 'readiness_work_superseded' }
    }
    nextToken = args.token
  } else {
    if (work.job.kind !== 'idle' && work.job.leaseUntil > now) return { kind: 'refused', code: 'readiness_work_active' }
    // Only the periodic watchdog renews the finite attempt budget, never recovery requests.
    if (now >= work.windowStartedAt + WINDOW_MS) work = { ...work,
      windowStartedAt: Math.floor(now / WINDOW_MS) * WINDOW_MS, attemptsInWindow: 0 }
    if (work.attemptsInWindow >= MAX_ATTEMPTS) return { kind: 'refused', code: 'readiness_work_budget_exhausted' }
    nextToken = token(work, now)
    work = { ...work, generation: work.generation + 1, attemptsInWindow: work.attemptsInWindow + 1 }
  }
  const claimedAt = now
  work = { ...work, job: { kind: 'running', token: nextToken, claimedVersion: work.requestedVersion,
    claimedAt, leaseUntil: now + LEASE_MS, configurationDigest: backendPaymentReadinessDigest(env), custodyDigest: custodyDigest() } }
  await save(ctx, previous, work)
  return { kind: 'claimed', environment: args.environment, token: nextToken,
    claimedVersion: work.requestedVersion, leaseUntil: now + LEASE_MS }
}

/**
 * Requires a current admitted readiness claim, unchanged custody/configuration and original probe clocks.
 * Ensures evidence publication and work completion/requeue commit in one transaction.
 * Invariant: stale workers cannot publish/clear newer work; current red defeats old green.
 * On violation: refuse without publication; unfinished demand survives for the watchdog.
 */
export async function completePaymentReadinessWork(ctx: MutationCtx, args: {
  snapshot: PaymentReadinessSnapshot; token: string
}): Promise<PublishPaymentReadinessResult | Refused> {
  const now = Date.now()
  const previous = await stored(ctx, args.snapshot.environment)
  if (previous === null || previous.job.kind !== 'running' || previous.job.token !== args.token
    || previous.job.leaseUntil <= now) return { kind: 'refused', code: 'readiness_work_superseded' }
  if (!valid(previous, now) || args.snapshot.startedAt < previous.job.claimedAt
    || previous.job.configurationDigest !== backendPaymentReadinessDigest(env)
    || previous.job.custodyDigest !== custodyDigest()) return { kind: 'refused', code: 'readiness_configuration_changed' }
  const treasury = await readTreasuryPaymentReadinessCheck(ctx, args.snapshot.environment, now)
  const result: PublishPaymentReadinessResult | Refused = args.snapshot.checks.treasury.kind === 'passed' && treasury.kind === 'failed'
    ? { kind: 'refused', code: 'readiness_treasury_changed' }
    : await publishPaymentReadiness(ctx, { snapshot: args.snapshot })
  if (result.kind === 'refused' && result.code !== 'readiness_treasury_changed') return result
  let work: PaymentReadinessWork = { ...material(previous),
    completedVersion: result.kind === 'published' ? Math.max(previous.completedVersion, previous.job.claimedVersion) : previous.completedVersion,
    job: { kind: 'idle' } }
  if (work.requestedVersion > work.completedVersion && work.attemptsInWindow < MAX_ATTEMPTS
    && treasury.kind === 'passed' && (await readPaymentReadiness(ctx, work.environment, now)).kind !== 'ready') {
    work = await queue(ctx, work, now)
  }
  await save(ctx, previous, work)
  return result
}
