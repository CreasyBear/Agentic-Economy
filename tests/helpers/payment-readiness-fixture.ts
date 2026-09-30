import { makeFunctionReference } from 'convex/server'
import { backendPaymentReadinessDigest, paymentReadinessExpiresAt, sealPaymentReadinessSnapshot,
  PAYMENT_READINESS_MAX_VALIDITY_MS, type PaymentReadinessChecks, type PaymentReadinessSnapshot,
} from '@/modules/money/payment-readiness'
import type { PublishPaymentReadinessResult } from '../../convex/lib/money/readiness/store'
import type { ConvexFixtureBackend } from './convex-fixtures'

const publish = makeFunctionReference<'mutation', { snapshot: PaymentReadinessSnapshot }, PublishPaymentReadinessResult>('moneyReadiness:publish')

/** Explicit test evidence only: the real seal, current config binding and publication mutation all execute. */
export async function seedPaymentReadiness(
  backend: ConvexFixtureBackend,
  options: { environment?: 'production' | 'sandbox'; validityMs?: number; checks?: PaymentReadinessChecks } = {},
): Promise<PaymentReadinessSnapshot> {
  const now = Date.now()
  const passed = { kind: 'passed' as const, validUntil: now + (options.validityMs ?? PAYMENT_READINESS_MAX_VALIDITY_MS) }
  const checks = options.checks ?? { web_configuration: passed, formance: passed, cdp_custody: passed,
    base_rpc: passed, reference_rate: passed, sanctions: passed, commercial_policy: passed, treasury: passed }
  const snapshot = sealPaymentReadinessSnapshot({ environment: options.environment ?? 'production',
    configurationDigest: backendPaymentReadinessDigest(process.env), startedAt: now, completedAt: now,
    expiresAt: paymentReadinessExpiresAt(now, checks), checks })
  const result = await backend.mutation(publish, { snapshot })
  if (result.kind !== 'published') throw new Error(`fixture_payment_readiness_refused:${result.code}`)
  return snapshot
}
