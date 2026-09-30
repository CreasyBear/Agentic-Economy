import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '../common/canonical-digest'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from './internal/commercial-policy'

export const PAYMENT_READINESS_MAX_PROBE_AGE_MS = 60_000
export const PAYMENT_READINESS_MAX_VALIDITY_MS = 10 * 60_000
export const PAYMENT_READINESS_CHECK_KEYS = [
  'web_configuration', 'formance', 'cdp_custody', 'base_rpc', 'reference_rate',
  'sanctions', 'commercial_policy', 'treasury',
] as const

export const paymentReadinessEnvironmentValue = v.union(v.literal('sandbox'), v.literal('production'))
export const paymentReadinessCheckValue = v.union(
  v.object({ kind: v.literal('passed'), validUntil: v.number() }),
  v.object({ kind: v.literal('failed'), code: v.string() }),
)
export const paymentReadinessChecksValue = v.object({
  web_configuration: paymentReadinessCheckValue, formance: paymentReadinessCheckValue,
  cdp_custody: paymentReadinessCheckValue, base_rpc: paymentReadinessCheckValue,
  reference_rate: paymentReadinessCheckValue, sanctions: paymentReadinessCheckValue,
  commercial_policy: paymentReadinessCheckValue, treasury: paymentReadinessCheckValue,
})
export const paymentReadinessSnapshotValue = v.object({
  environment: paymentReadinessEnvironmentValue, configurationDigest: v.string(),
  startedAt: v.number(), completedAt: v.number(), expiresAt: v.number(),
  checks: paymentReadinessChecksValue, evidenceDigest: v.string(),
})
export const paymentReadinessViewValue = v.object({
  kind: v.union(v.literal('ready'), v.literal('not_ready')),
  environment: paymentReadinessEnvironmentValue,
  checkedAt: v.union(v.null(), v.number()), expiresAt: v.union(v.null(), v.number()),
  code: v.union(v.null(), v.string()), checks: paymentReadinessChecksValue,
})
export type PaymentReadinessCheck = Infer<typeof paymentReadinessCheckValue>
export type PaymentReadinessChecks = Infer<typeof paymentReadinessChecksValue>
export type PaymentReadinessSnapshot = Infer<typeof paymentReadinessSnapshotValue>
export type PaymentReadinessView = Infer<typeof paymentReadinessViewValue>

// Explicit backend configuration only. Web Clerk/browser/Sentry configuration is
// proved by the live web probe; mirrored VITE variables cannot establish it here.
const BACKEND_CONFIGURATION_NAMES = [
  'AE_DEPLOYMENT_ENVIRONMENT', 'AE_RELEASE_SOURCE_REVISION', 'AE_SITE_URL', 'SITE_URL', 'CONVEX_CLOUD_URL',
  'AE_FORMANCE_ENVIRONMENT', 'AE_FORMANCE_GATEWAY_URL', 'AE_FORMANCE_LEDGER',
  'AE_FORMANCE_ACCESS_CLIENT_ID', 'AE_FORMANCE_ACCESS_CLIENT_SECRET', 'AE_FORMANCE_REQUEST_TIMEOUT_MS',
  'CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET',
  'AE_X402_CUSTODY_ENABLED', 'AE_X402_CDP_ACCOUNT_NAME', 'AE_X402_CDP_EXPECTED_EVM_ADDRESS',
  'AE_X402_CDP_ACCOUNT_POLICY_ID', 'AE_X402_CDP_PROJECT_POLICY_ID', 'AE_X402_CDP_POLICY_RULES_DIGEST',
  'AE_X402_CDP_CREDENTIAL_GENERATION', 'AE_X402_CUSTODY_MAX_ATOMIC', 'AE_X402_CUSTODY_DAILY_MAX_ATOMIC',
  'AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC', 'AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC', 'AE_X402_RPC_URLS_JSON',
  'CLERK_SECRET_KEY', 'CLERK_JWT_ISSUER_DOMAIN', 'AE_CONVEX_SERVER_FUNCTION_TOKEN',
  'AE_ROUTE_CALL_SIGNING_SECRET', 'AE_ROUTE_CALL_SIGNING_KEY_ID',
] as const

/**
 * Requires the actual backend runtime environment, never a names-only manifest.
 * Ensures credential rotation changes the opaque binding without emitting inputs.
 * Invariant: credential values occur only inside hash material, never a view/log.
 * On violation: canonicalDigest rejects malformed/unbounded input; no readiness is produced.
 */
export function backendPaymentReadinessDigest(environment: Readonly<Record<string, string | undefined>>): string {
  return canonicalDigest({ format: 'ae.backend-payment-readiness-configuration:v1',
    requirements: PACKAGE4_FORMANCE_REQUIREMENTS,
    values: BACKEND_CONFIGURATION_NAMES.map(name => ({ name, value: environment[name] ?? null })),
  })
}

/** Seals exact server evidence; publication separately enforces clocks/configuration. */
export function sealPaymentReadinessSnapshot(
  material: Omit<PaymentReadinessSnapshot, 'evidenceDigest'>,
): PaymentReadinessSnapshot {
  return { ...material, evidenceDigest: canonicalDigest({ format: 'ae.payment-readiness-evidence:v1', ...material }) }
}

/** Expiry is derived from the earliest passing evidence and the probe start, never completion. */
export function paymentReadinessExpiresAt(startedAt: number, checks: PaymentReadinessChecks): number {
  return PAYMENT_READINESS_CHECK_KEYS.reduce((expiresAt, key) => {
    const check = checks[key]
    return check.kind === 'passed' ? Math.min(expiresAt, check.validUntil) : expiresAt
  }, startedAt + PAYMENT_READINESS_MAX_VALIDITY_MS)
}

const DIGEST = /^sha256:[a-f0-9]{64}$/u
const CODE = /^[a-z][a-z0-9_]{0,99}$/u
const clock = (value: number): boolean => Number.isSafeInteger(value) && value >= 0

/** Complete fixed checks, exact seal and safe clocks are required even for failed evidence. */
export function validPaymentReadinessSnapshot(snapshot: PaymentReadinessSnapshot, now: number): boolean {
  if (!clock(now) || !DIGEST.test(snapshot.configurationDigest) || !DIGEST.test(snapshot.evidenceDigest)
    || ![snapshot.startedAt, snapshot.completedAt, snapshot.expiresAt].every(clock)
    || snapshot.startedAt > snapshot.completedAt || snapshot.completedAt > now
    || snapshot.completedAt - snapshot.startedAt > PAYMENT_READINESS_MAX_PROBE_AGE_MS
    || !Number.isSafeInteger(snapshot.startedAt + PAYMENT_READINESS_MAX_VALIDITY_MS)
    || snapshot.expiresAt <= snapshot.completedAt
    || Object.keys(snapshot.checks).length !== PAYMENT_READINESS_CHECK_KEYS.length) return false
  for (const key of PAYMENT_READINESS_CHECK_KEYS) {
    const check = snapshot.checks[key]
    if (check === undefined || (check.kind === 'passed'
      ? !clock(check.validUntil) || check.validUntil <= snapshot.completedAt
      : check.kind !== 'failed' || !CODE.test(check.code))) return false
  }
  if (snapshot.expiresAt !== paymentReadinessExpiresAt(snapshot.startedAt, snapshot.checks)) return false
  const { evidenceDigest, ...material } = snapshot
  return sealPaymentReadinessSnapshot(material).evidenceDigest === evidenceDigest
}

/** All absent/invalid/changed evidence becomes explicit failures, never leftover green checks. */
export function failedPaymentReadinessChecks(code: string): PaymentReadinessChecks {
  const failed: PaymentReadinessCheck = { kind: 'failed', code }
  return { web_configuration: failed, formance: failed, cdp_custody: failed, base_rpc: failed,
    reference_rate: failed, sanctions: failed, commercial_policy: failed, treasury: failed }
}
