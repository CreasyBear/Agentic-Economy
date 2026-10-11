import { readPaymentReadiness } from '../../money/readiness/store'
import { treasuryResumeRefusal } from '../../money/treasury/health'
import type { Doc } from '../../../_generated/dataModel'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import type { AdminCommandSpec } from '../commands/commandEnvelope'
import type { AdminCommandWireArgs } from '../commands/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deploymentPaymentEnvironment, type PaymentEnvironment } from '@/lib/deployment/environment'
import { DEFAULT_TREASURY_THRESHOLDS, type TreasuryThresholds } from '@/modules/money/treasury'

export type TreasuryControlState = Readonly<{
  launch: Pick<Doc<'platformLaunch'>, 'environment' | 'paymentsOpenTo' | 'resumePaymentsOpenTo' | 'revision' | 'updatedAt'>
  settings: Pick<Doc<'moneyTreasurySettings'>, 'environment' | 'thresholds' | 'revision' | 'updatedAt'>
  launchStateDigest: string
  settingsStateDigest: string
}>

/** Absent rows have explicit defaults and stable digests; this query does not read the clock. */
export async function readTreasuryControlState(
  ctx: Pick<QueryCtx, 'db'>,
  environment: PaymentEnvironment,
): Promise<TreasuryControlState> {
  const [launchRow, settingsRow] = await Promise.all([
    ctx.db.query('platformLaunch').withIndex('by_environment', (q) => q.eq('environment', environment)).unique(),
    ctx.db.query('moneyTreasurySettings').withIndex('by_environment', (q) => q.eq('environment', environment)).unique(),
  ])
  const defaultAudience = environment === 'production' ? 'admins' : 'everyone'
  const launch: TreasuryControlState['launch'] = {
    environment,
    paymentsOpenTo: launchRow?.paymentsOpenTo ?? defaultAudience,
    resumePaymentsOpenTo: launchRow?.resumePaymentsOpenTo ?? defaultAudience,
    revision: launchRow?.revision ?? 0,
    updatedAt: launchRow?.updatedAt ?? 0,
  }
  const settings: TreasuryControlState['settings'] = {
    environment,
    thresholds: settingsRow?.thresholds ?? DEFAULT_TREASURY_THRESHOLDS,
    revision: settingsRow?.revision ?? 0,
    updatedAt: settingsRow?.updatedAt ?? 0,
  }
  return { launch, settings, launchStateDigest: canonicalDigest(launch), settingsStateDigest: canonicalDigest(settings) }
}

export function treasuryCommandEnvironmentMatches(environment: PaymentEnvironment): boolean {
  return deploymentPaymentEnvironment(env) === environment
}

/** Parse wire units once into the fixed-threshold variant before persisting it. */
export function parseTreasuryThresholds(input: Readonly<{
  lowWaterUnits: string
  targetFloatUnits: string
}>): Extract<TreasuryThresholds, { kind: 'fixed' }> | null {
  const canonicalUnits = /^(0|[1-9]\d{0,15})$/u
  if (!canonicalUnits.test(input.lowWaterUnits) || !canonicalUnits.test(input.targetFloatUnits)) return null
  const lowWater = BigInt(input.lowWaterUnits)
  const target = BigInt(input.targetFloatUnits)
  if (target <= 0n || lowWater > target || target > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return { kind: 'fixed', lowWaterUnits: input.lowWaterUnits, targetFloatUnits: input.targetFloatUnits }
}

/**
 * Requires: owner-admin signed command, fresh MFA, deployment environment and reviewed state digest.
 * Ensures: pause preserves the current audience; resume restores that saved audience only.
 * Invariant: no audience widening; repeated pause/resume does not revise the launch row.
 * On violation: the envelope refuses target_changed/authority/proof errors; environment mismatch refuses.
 * Retry/audit: the existing envelope commits state, audit and cached receipt in one mutation.
 */
export function paymentsPausedSpec(
  ctx: MutationCtx,
  args: AdminCommandWireArgs<'set_payments_paused'>,
): AdminCommandSpec<'set_payments_paused'> {
  const { environment, paused } = args.input
  return {
    targetType: 'billing', targetRef: `platform-launch:${environment}`,
    auditEventType: 'protected_action.attempt_succeeded', requireExpectedStateDigest: true,
    currentStateDigest: async () => (await readTreasuryControlState(ctx, environment)).launchStateDigest,
    apply: async () => {
      if (!treasuryCommandEnvironmentMatches(environment)) return { kind: 'refused', code: 'environment_mismatch' }
      const { launch } = await readTreasuryControlState(ctx, environment)
      if (!paused && launch.paymentsOpenTo === 'none') {
        if (environment === 'production' && (await readPaymentReadiness(ctx, environment, Date.now())).kind !== 'ready') {
          return { kind: 'refused', code: 'payments_not_ready' }
        }
        const refusal = await treasuryResumeRefusal(ctx, environment, Date.now())
        if (refusal !== undefined) return { kind: 'refused', code: refusal }
      }
      const paymentsOpenTo = paused ? 'none'
        : launch.paymentsOpenTo === 'none' ? launch.resumePaymentsOpenTo : launch.paymentsOpenTo
      const resumePaymentsOpenTo = paused && launch.paymentsOpenTo !== 'none'
        ? launch.paymentsOpenTo : launch.resumePaymentsOpenTo
      if (paymentsOpenTo !== launch.paymentsOpenTo) {
        const row = await ctx.db.query('platformLaunch')
          .withIndex('by_environment', (q) => q.eq('environment', environment)).unique()
        const next: TreasuryControlState['launch'] = { environment, paymentsOpenTo, resumePaymentsOpenTo, revision: launch.revision + 1, updatedAt: Date.now() }
        if (row === null) await ctx.db.insert('platformLaunch', next)
        else await ctx.db.patch(row._id, next)
      }
      return {
        kind: 'applied', code: paused ? 'payments_paused' : 'payments_resumed',
        effectRefs: [`platform-launch:${environment}`],
        beforeState: launch.paymentsOpenTo, afterState: paymentsOpenTo,
      }
    },
  }
}

/**
 * Requires: the same signed owner/MFA/digest boundary as pause; Ensures: sets who payments are open to
 * ('admins' = trial credit only, 'everyone' = full Stripe and paid calls). Widening runs the resume gates.
 * Invariant: while paused ('none') only the saved resume audience changes; no revision bump when unchanged.
 */
export function paymentsAudienceSpec(
  ctx: MutationCtx,
  args: AdminCommandWireArgs<'set_payments_audience'>,
): AdminCommandSpec<'set_payments_audience'> {
  const { environment, audience } = args.input
  return {
    targetType: 'billing', targetRef: `platform-launch:${environment}`,
    auditEventType: 'protected_action.attempt_succeeded', requireExpectedStateDigest: true,
    currentStateDigest: async () => (await readTreasuryControlState(ctx, environment)).launchStateDigest,
    apply: async () => {
      if (!treasuryCommandEnvironmentMatches(environment)) return { kind: 'refused', code: 'environment_mismatch' }
      const { launch } = await readTreasuryControlState(ctx, environment)
      if (audience === 'everyone' && launch.paymentsOpenTo !== 'everyone') {
        if (environment === 'production' && (await readPaymentReadiness(ctx, environment, Date.now())).kind !== 'ready') {
          return { kind: 'refused', code: 'payments_not_ready' }
        }
        const refusal = await treasuryResumeRefusal(ctx, environment, Date.now())
        if (refusal !== undefined) return { kind: 'refused', code: refusal }
      }
      const paymentsOpenTo = launch.paymentsOpenTo === 'none' ? 'none' : audience
      if (paymentsOpenTo !== launch.paymentsOpenTo || audience !== launch.resumePaymentsOpenTo) {
        const row = await ctx.db.query('platformLaunch')
          .withIndex('by_environment', (q) => q.eq('environment', environment)).unique()
        const next: TreasuryControlState['launch'] = { environment, paymentsOpenTo, resumePaymentsOpenTo: audience, revision: launch.revision + 1, updatedAt: Date.now() }
        if (row === null) await ctx.db.insert('platformLaunch', next)
        else await ctx.db.patch(row._id, next)
      }
      return {
        kind: 'applied', code: 'payments_audience_changed',
        effectRefs: [`platform-launch:${environment}`],
        beforeState: launch.paymentsOpenTo, afterState: paymentsOpenTo,
      }
    },
  }
}

/**
 * Requires: the same signed owner/MFA/digest boundary, canonical bounded units, 0 <= lowWater <= target and target > 0.
 * Ensures: stores a complete fixed-threshold variant; never changes payment authority or audience.
 * Invariant: one settings row per environment, protected by transactional indexed reads.
 * On violation: treasury_thresholds_invalid or environment_mismatch; no settings write occurs.
 * Retry/audit: non-idempotent revision increments are protected by the envelope's atomic receipt cache.
 */
export function treasuryThresholdsSpec(
  ctx: MutationCtx,
  args: AdminCommandWireArgs<'change_treasury_thresholds'>,
): AdminCommandSpec<'change_treasury_thresholds'> {
  const { environment } = args.input
  return {
    targetType: 'billing', targetRef: `treasury-settings:${environment}`,
    auditEventType: 'protected_action.attempt_succeeded', requireExpectedStateDigest: true,
    currentStateDigest: async () => (await readTreasuryControlState(ctx, environment)).settingsStateDigest,
    apply: async () => {
      if (!treasuryCommandEnvironmentMatches(environment)) return { kind: 'refused', code: 'environment_mismatch' }
      const thresholds = parseTreasuryThresholds(args.input)
      if (thresholds === null) return { kind: 'refused', code: 'treasury_thresholds_invalid' }
      const { settings } = await readTreasuryControlState(ctx, environment)
      const row = await ctx.db.query('moneyTreasurySettings')
        .withIndex('by_environment', (q) => q.eq('environment', environment)).unique()
      const next = { environment, thresholds, revision: settings.revision + 1, updatedAt: Date.now() }
      if (row === null) await ctx.db.insert('moneyTreasurySettings', next)
      else await ctx.db.patch(row._id, next)
      return {
        kind: 'applied', code: 'treasury_thresholds_changed', effectRefs: [`treasury-settings:${environment}`],
        beforeState: JSON.stringify(settings.thresholds), afterState: JSON.stringify(thresholds),
      }
    },
  }
}
