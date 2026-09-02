import Decimal from 'decimal.js'

import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'

import { readExactAmount, type ExactAmount } from './exact-amount'

const SANDBOX_AUD_TO_USDC_NUMERATOR = 65
const SANDBOX_AUD_TO_USDC_DENOMINATOR = 100
const SANDBOX_RATE_TTL_MS = 5 * 60 * 1_000

export type ExecutableRateEnvironment = 'sandbox' | 'production'

export type ExecutableRateEvidence = Readonly<{
  version: 'ae.executable-rate:v1'
  environment: ExecutableRateEnvironment
  source: 'sandbox_deterministic'
  sourceAmount: Readonly<{
    currency: 'AUD'
    exponent: 6
    units: string
  }>
  targetAmount: Readonly<{
    currency: 'USDC'
    exponent: 6
    units: string
  }>
  rateNumerator: string
  rateDenominator: string
  rounding: 'target_up'
  observedAt: number
  expiresAt: number
  evidenceDigest: string
}>

export type ExecutableRateQuoteResult =
  | Readonly<{ kind: 'quoted'; evidence: ExecutableRateEvidence }>
  | Readonly<{
      kind: 'refused'
      code: 'pricing_setup_required' | 'pricing_source_amount_invalid'
      retryable: false
    }>

export type ExecutableRatePort = Readonly<{
  quote(input: Readonly<{ sourceAmount: ExactAmount }>): Promise<ExecutableRateQuoteResult>
}>

type ExecutableRateMaterial = Omit<ExecutableRateEvidence, 'evidenceDigest'>

function rateMaterial(evidence: ExecutableRateEvidence): ExecutableRateMaterial {
  const { evidenceDigest: _evidenceDigest, ...material } = evidence
  return material
}

function canonicalPositiveAud(amount: unknown): ExecutableRateEvidence['sourceAmount'] | undefined {
  const parsed = readExactAmount(amount)
  return parsed !== undefined
    && parsed.currency === 'AUD'
    && parsed.exponent === 6
    && BigInt(parsed.units) > 0n
    ? { currency: 'AUD', exponent: 6, units: parsed.units }
    : undefined
}

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export function quoteExecutableAudToUsdc(input: Readonly<{
  environment: ExecutableRateEnvironment
  sourceAmount: ExactAmount
  observedAt: number
}>): ExecutableRateQuoteResult {
  const sourceAmount = canonicalPositiveAud(input.sourceAmount)
  if (sourceAmount === undefined || !validTimestamp(input.observedAt)) {
    return { kind: 'refused', code: 'pricing_source_amount_invalid', retryable: false }
  }
  if (input.environment !== 'sandbox') {
    return { kind: 'refused', code: 'pricing_setup_required', retryable: false }
  }
  const targetUnits = new Decimal(sourceAmount.units)
    .mul(SANDBOX_AUD_TO_USDC_NUMERATOR)
    .div(SANDBOX_AUD_TO_USDC_DENOMINATOR)
    .ceil()
    .toFixed(0)
  const material: ExecutableRateMaterial = {
    version: 'ae.executable-rate:v1',
    environment: 'sandbox',
    source: 'sandbox_deterministic',
    sourceAmount,
    targetAmount: { currency: 'USDC', exponent: 6, units: targetUnits },
    rateNumerator: String(SANDBOX_AUD_TO_USDC_NUMERATOR),
    rateDenominator: String(SANDBOX_AUD_TO_USDC_DENOMINATOR),
    rounding: 'target_up',
    observedAt: input.observedAt,
    expiresAt: input.observedAt + SANDBOX_RATE_TTL_MS,
  }
  return {
    kind: 'quoted',
    evidence: { ...material, evidenceDigest: canonicalDigest(material) },
  }
}

/**
 * Prices an exact upstream USDC requirement in Account AUD. The result uses
 * the same deterministic sandbox rate evidence as the forward quote and
 * rounds the customer amount up so the resulting treasury capacity can never
 * be below the upstream requirement.
 */
export function quoteManagedX402BuyerAud(input: Readonly<{
  environment: ExecutableRateEnvironment
  requiredUsdcAtomicUnits: string
  observedAt: number
}>): ExecutableRateQuoteResult {
  if (!/^[1-9]\d*$/u.test(input.requiredUsdcAtomicUnits)) {
    return { kind: 'refused', code: 'pricing_source_amount_invalid', retryable: false }
  }
  const audUnits = new Decimal(input.requiredUsdcAtomicUnits)
    .mul(SANDBOX_AUD_TO_USDC_DENOMINATOR)
    .div(SANDBOX_AUD_TO_USDC_NUMERATOR)
    .ceil()
    .toFixed(0)
  return quoteExecutableAudToUsdc({
    environment: input.environment,
    sourceAmount: { currency: 'AUD', exponent: 6, units: audUnits },
    observedAt: input.observedAt,
  })
}

/**
 * Split an inclusive buyer price at the explicit commercial-policy boundary.
 * Money remains integer units; Decimal is used only for the documented
 * half-up rounding decision.
 */
export function splitInclusiveAudTax(
  totalUnits: string,
  taxBps: number,
): Readonly<{ revenueUnits: string; taxUnits: string }> | undefined {
  if (!/^[1-9]\d*$/u.test(totalUnits)
    || !Number.isSafeInteger(taxBps)
    || taxBps < 0
    || taxBps > 10_000) return undefined
  const total = BigInt(totalUnits)
  const tax = BigInt(new Decimal(totalUnits)
    .mul(taxBps)
    .div(10_000 + taxBps)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toFixed(0))
  if (tax <= 0n || tax >= total) return undefined
  return Object.freeze({
    revenueUnits: (total - tax).toString(),
    taxUnits: tax.toString(),
  })
}

export function validateExecutableRateEvidence(
  evidence: ExecutableRateEvidence,
  now: number,
): boolean {
  if (!validTimestamp(now) || !isCanonicalDigest(evidence.evidenceDigest)) return false
  const expected = quoteExecutableAudToUsdc({
    environment: evidence.environment,
    sourceAmount: evidence.sourceAmount,
    observedAt: evidence.observedAt,
  })
  return expected.kind === 'quoted'
    && evidence.source === 'sandbox_deterministic'
    && evidence.expiresAt > now
    && evidence.evidenceDigest === canonicalDigest(rateMaterial(evidence))
    && evidence.evidenceDigest === expected.evidence.evidenceDigest
}

export function createExecutableRatePort(input: Readonly<{
  environment: ExecutableRateEnvironment
  now?: () => number
}>): ExecutableRatePort {
  const now = input.now ?? Date.now
  return Object.freeze({
    quote: async ({ sourceAmount }) => {
      if (input.environment === 'production') {
        return { kind: 'refused', code: 'pricing_setup_required', retryable: false }
      }
      return quoteExecutableAudToUsdc({
        environment: input.environment,
        sourceAmount,
        observedAt: now(),
      })
    },
  })
}
