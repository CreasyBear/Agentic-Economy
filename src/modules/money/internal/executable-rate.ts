import Decimal from 'decimal.js'

import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'

import { readExactAmount, type ExactAmount } from './exact-amount'

const SANDBOX_AUD_TO_USDC_NUMERATOR = 65
const SANDBOX_AUD_TO_USDC_DENOMINATOR = 100
const SANDBOX_RATE_TTL_MS = 5 * 60 * 1_000

export type ExecutableRateEnvironment = 'sandbox' | 'production'

export type LegacyExecutableRateEvidence = Readonly<{
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

export type ReferenceRate = Readonly<{
  source: 'coinbase'
  base: 'USDC'
  quote: 'AUD'
  rate: string
  fetchedAt: number
}>

export type ManagedReferenceRateEvidence = Readonly<{
  version: 'ae.managed-reference-price:v1'
  environment: ExecutableRateEnvironment
  source: 'coinbase'
  referenceRate: ReferenceRate
  sourceAmount: LegacyExecutableRateEvidence['sourceAmount']
  targetAmount: LegacyExecutableRateEvidence['targetAmount']
  rounding: 'buyer_aud_micro_unit_up'
  marginBps: 0
  observedAt: number
  expiresAt: number
  evidenceDigest: string
}>

export type ExecutableRateEvidence = LegacyExecutableRateEvidence | ManagedReferenceRateEvidence

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

type ExecutableRateMaterial = Omit<LegacyExecutableRateEvidence, 'evidenceDigest'>

function rateMaterial(evidence: LegacyExecutableRateEvidence): ExecutableRateMaterial {
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
  const sourceUnits = BigInt(sourceAmount.units)
  const targetUnits = (
    (sourceUnits * BigInt(SANDBOX_AUD_TO_USDC_NUMERATOR)
      + BigInt(SANDBOX_AUD_TO_USDC_DENOMINATOR - 1))
    / BigInt(SANDBOX_AUD_TO_USDC_DENOMINATOR)
  ).toString()
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
 * Prices an exact upstream USDC requirement in Account AUD using the supplied
 * reference observation. Omitting it preserves the historical sandbox fixture
 * and its capacity-based arithmetic for existing callers and evidence.
 */
export function quoteManagedX402BuyerAud(input: Readonly<{
  environment: ExecutableRateEnvironment
  requiredUsdcAtomicUnits: string
  observedAt: number
  referenceRate?: ReferenceRate
}>): ExecutableRateQuoteResult {
  if (input.referenceRate !== undefined) return quoteReferenceBuyerAud(input)
  if (!/^[1-9]\d*$/u.test(input.requiredUsdcAtomicUnits)) {
    return { kind: 'refused', code: 'pricing_source_amount_invalid', retryable: false }
  }
  const requiredUnits = BigInt(input.requiredUsdcAtomicUnits)
  const audUnits = (
    ((requiredUnits - 1n) * BigInt(SANDBOX_AUD_TO_USDC_DENOMINATOR))
    / BigInt(SANDBOX_AUD_TO_USDC_NUMERATOR)
    + 1n
  ).toString()
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
  const tax = BigInt(new (Decimal.clone({ precision: totalUnits.length + 20 }))(totalUnits)
    .mul(taxBps)
    .div(10_000 + taxBps)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toFixed(0))
  if (tax < 0n || tax >= total) return undefined
  return Object.freeze({
    revenueUnits: (total - tax).toString(),
    taxUnits: tax.toString(),
  })
}

/** Validates canonical rate input without treating it as an executed exchange. */
export function validReferenceRate(rate: ReferenceRate): boolean {
  return rate !== null && typeof rate === 'object'
    && rate.source === 'coinbase' && rate.base === 'USDC' && rate.quote === 'AUD'
    && typeof rate.rate === 'string'
    && /^(?:0|[1-9]\d{0,29})(?:\.\d{1,30})?$/u.test(rate.rate)
    && new Decimal(rate.rate).gt(0)
    && validTimestamp(rate.fetchedAt)
    && Number.isSafeInteger(rate.fetchedAt + SANDBOX_RATE_TTL_MS)
}

function quoteReferenceBuyerAud(input: Readonly<{
  environment: ExecutableRateEnvironment
  requiredUsdcAtomicUnits: string
  observedAt: number
  referenceRate?: ReferenceRate
}>): ExecutableRateQuoteResult {
  const rate = input.referenceRate
  if ((input.environment !== 'sandbox' && input.environment !== 'production')
    || rate === undefined || !validReferenceRate(rate)
    || !/^[1-9]\d{0,29}$/u.test(input.requiredUsdcAtomicUnits)
    || !validTimestamp(input.observedAt)
    || input.observedAt < rate.fetchedAt
    || input.observedAt >= rate.fetchedAt + SANDBOX_RATE_TTL_MS) {
    return { kind: 'refused', code: 'pricing_source_amount_invalid', retryable: false }
  }
  // Each operand is bounded to 60 digits; cloning avoids changing global precision.
  const ExactDecimal = Decimal.clone({ precision: 100 })
  const units = new ExactDecimal(input.requiredUsdcAtomicUnits).mul(rate.rate)
    .toDecimalPlaces(0, Decimal.ROUND_CEIL).toFixed(0)
  if (canonicalPositiveAud({ currency: 'AUD', exponent: 6, units }) === undefined) {
    return { kind: 'refused', code: 'pricing_source_amount_invalid', retryable: false }
  }
  const material: Omit<ManagedReferenceRateEvidence, 'evidenceDigest'> = {
    version: 'ae.managed-reference-price:v1', environment: input.environment,
    source: 'coinbase', referenceRate: { ...rate },
    sourceAmount: { currency: 'AUD', exponent: 6, units },
    targetAmount: { currency: 'USDC', exponent: 6, units: input.requiredUsdcAtomicUnits },
    rounding: 'buyer_aud_micro_unit_up', marginBps: 0,
    observedAt: rate.fetchedAt, expiresAt: rate.fetchedAt + SANDBOX_RATE_TTL_MS,
  }
  return { kind: 'quoted', evidence: { ...material, evidenceDigest: canonicalDigest(material) } }
}

/** Recovery checks immutable evidence independently of current FX freshness. */
export function validateExecutableRateEvidenceIntegrity(evidence: ExecutableRateEvidence): boolean {
  if (evidence === null || typeof evidence !== 'object'
    || !isCanonicalDigest(evidence.evidenceDigest)) return false
  if (evidence.version === 'ae.managed-reference-price:v1') {
    if (evidence.referenceRate === null || typeof evidence.referenceRate !== 'object'
      || readExactAmount(evidence.targetAmount) === undefined) return false
    const expected = quoteReferenceBuyerAud({
      environment: evidence.environment,
      requiredUsdcAtomicUnits: evidence.targetAmount.units,
      observedAt: evidence.observedAt,
      referenceRate: evidence.referenceRate,
    })
    const { evidenceDigest: _digest, ...material } = evidence
    return expected.kind === 'quoted'
      && evidence.evidenceDigest === canonicalDigest(material)
      && evidence.evidenceDigest === expected.evidence.evidenceDigest
  }
  if (evidence.version !== 'ae.executable-rate:v1') return false
  const expected = quoteExecutableAudToUsdc({
    environment: evidence.environment,
    sourceAmount: evidence.sourceAmount,
    observedAt: evidence.observedAt,
  })
  return expected.kind === 'quoted'
    && evidence.source === 'sandbox_deterministic'
    && evidence.evidenceDigest === canonicalDigest(rateMaterial(evidence))
    && evidence.evidenceDigest === expected.evidence.evidenceDigest
}

export function validateExecutableRateEvidence(
  evidence: ExecutableRateEvidence,
  now: number,
): boolean {
  return validTimestamp(now) && evidence.observedAt <= now && evidence.expiresAt > now
    && validateExecutableRateEvidenceIntegrity(evidence)
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
