import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'

export const X402_SPEND_WINDOW_MS = 24 * 60 * 60 * 1_000
export const X402_SCREENING_FRESHNESS_MS = 5_000
export const X402_SPEND_HISTORY_LIMIT = 256
export const X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC_ENV = 'AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC'
export const X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC_ENV = 'AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC'

export const ALPHA_X402_PAYEE_SCREENING_POLICY = 'alpha_not_screened_v1' as const
export const ALPHA_X402_PAYEE_SCREENING_REASON = 'trm_deferred_until_beta' as const

export function alphaX402PayeeScreeningEnabled(environment: Readonly<Record<string, string | undefined>>): boolean {
  return environment.AE_X402_PAYEE_SCREENING_POLICY === ALPHA_X402_PAYEE_SCREENING_POLICY
}

const screeningIdentityValue = {
  network: v.string(),
  normalizedPayTo: v.string(),
  paymentUnsignedMaterialDigest: v.string(),
  typedDataDigest: v.string(),
  startedAt: v.number(),
  checkedAt: v.number(),
}

export const x402PayeeScreeningDecisionValue = v.union(v.object({
  ...screeningIdentityValue,
  provider: v.literal('trm-wallet-screening'),
  outcome: v.union(v.literal('clear'), v.literal('hit'), v.literal('unavailable')),
  reason: v.string(),
  providerReference: v.optional(v.string()),
  evidenceDigest: v.optional(v.string()),
}), v.object({
  ...screeningIdentityValue,
  provider: v.literal('none'),
  outcome: v.literal('not_screened'),
  policyRef: v.literal(ALPHA_X402_PAYEE_SCREENING_POLICY),
  reason: v.literal(ALPHA_X402_PAYEE_SCREENING_REASON),
}))
export type X402PayeeScreeningDecision = Infer<typeof x402PayeeScreeningDecisionValue>

export const x402SpendAdmissionRefusalCodeValue = v.union(
  v.literal('screening_not_clear'),
  v.literal('screening_identity_invalid'),
  v.literal('screening_stale'),
  v.literal('screening_replayed'),
  v.literal('spend_configuration_invalid'),
  v.literal('spend_history_incomplete'),
  v.literal('spend_history_saturated'),
  v.literal('spend_identity_conflict'),
  v.literal('spend_authority_invalid'),
  v.literal('spend_reservation_terminal'),
  v.literal('spend_call_cap_exceeded'),
  v.literal('spend_platform_cap_exceeded'),
  v.literal('spend_payee_cap_exceeded'),
  v.literal('spend_new_payee_cap_exceeded'),
)
export type X402SpendAdmissionRefusalCode = Infer<typeof x402SpendAdmissionRefusalCodeValue>

export const x402SpendAdmissionResultValue = v.union(
  v.object({
    kind: v.literal('admitted'),
    reservationRef: v.string(),
    screeningCheckRef: v.string(),
    policyRevision: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: x402SpendAdmissionRefusalCodeValue,
    screeningCheckRef: v.string(),
  }),
)
export type X402SpendAdmissionResult = Infer<typeof x402SpendAdmissionResultValue>

export type X402SpendPolicy = Readonly<{
  platformBudgetRef: string
  policyRevision: string
  callMaximumUnits: string
  platformDailyMaximumUnits: string
  payeeDailyMaximumUnits: string
  newPayeeMaximumUnits: string
}>

export function isPositiveX402AtomicUnits(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,77}$/.test(value)
}

/** Requires all four trusted ceilings; no caller-provided cap or monetary default. */
export function x402SpendPolicyFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  scope: Readonly<{ environment: 'sandbox' | 'production'; network: string; asset: string }>,
): X402SpendPolicy | undefined {
  const callMaximumUnits = environment.AE_X402_CUSTODY_MAX_ATOMIC
  const platformDailyMaximumUnits = environment.AE_X402_CUSTODY_DAILY_MAX_ATOMIC
  const payeeDailyMaximumUnits = environment[X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC_ENV]
  const newPayeeMaximumUnits = environment[X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC_ENV]
  if (!isPositiveX402AtomicUnits(callMaximumUnits)
    || !isPositiveX402AtomicUnits(platformDailyMaximumUnits)
    || !isPositiveX402AtomicUnits(payeeDailyMaximumUnits)
    || !isPositiveX402AtomicUnits(newPayeeMaximumUnits)) return undefined
  const platformBudgetRef = canonicalDigest({
    kind: 'ae.x402.platform-spend-budget:v1',
    ...scope,
    asset: scope.asset.toLowerCase(),
    currency: 'USDC', exponent: 6,
  })
  const limits = { callMaximumUnits, platformDailyMaximumUnits, payeeDailyMaximumUnits, newPayeeMaximumUnits }
  const policyRevision = canonicalDigest({
    kind: 'ae.x402.spend-policy:v1',
    platformBudgetRef,
    ...limits,
    spendWindowMs: X402_SPEND_WINDOW_MS,
    screeningFreshnessMs: X402_SCREENING_FRESHNESS_MS,
    exposure: 'all_liability_plus_settled_in_rolling_window',
    newPayeeWindow: 'first_admitted_reservation',
    callWindow: 'lifetime_non_unused',
    screeningInvocation: 'single_use',
  })
  return { platformBudgetRef, policyRevision, ...limits }
}

export function x402SpendReservationRef(input: Readonly<{
  custodyRef: string; attemptRef: string; effectGeneration: number; paymentIdentityDigest: string
}>): string {
  return canonicalDigest({ kind: 'ae.x402.spend-reservation:v1', ...input })
}
