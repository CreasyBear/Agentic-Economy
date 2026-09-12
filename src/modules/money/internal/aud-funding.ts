import Decimal from 'decimal.js'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { CommercialPolicyControls } from './commercial-policy'

export const AUD_EXPONENT = 6 as const

const MAX_UNITS_DIGITS = 30
const BPS_DENOMINATOR = 10_000n
const AudDecimal = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP })

export type AudFundingPolicy = Readonly<{
  minimumPrincipalUnits: bigint
  maximumPrincipalUnits: bigint
  incrementUnits: bigint
  serviceFeeBps: number
  taxOnServiceFeeBps: number
  legalCustomerMaximumAccessibleUnits: bigint
}>

// The platform fee applies to Account loading (service fee + GST), never to Quote/Call usage; see commercial-policy controls.
export function audFundingPolicyFromCommercialControls(
  controls: CommercialPolicyControls,
): AudFundingPolicy {
  return Object.freeze({
    minimumPrincipalUnits: BigInt(controls.accounting_client_money.minimumFundingPrincipalUnits),
    maximumPrincipalUnits: BigInt(controls.accounting_client_money.maximumFundingPrincipalUnits),
    incrementUnits: BigInt(controls.accounting_client_money.fundingIncrementUnits),
    serviceFeeBps: controls.operations.fundingServiceFeeBps,
    taxOnServiceFeeBps: controls.tax.serviceFeeTaxBps,
    legalCustomerMaximumAccessibleUnits: BigInt(
      controls.accounting_client_money.legalCustomerMaximumAccessibleUnits,
    ),
  })
}

export function canonicalAudUnits(value: string): bigint | undefined {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(value)) return undefined
  try {
    const decimal = new AudDecimal(value)
    const scaled = decimal.mul(new AudDecimal(10).pow(AUD_EXPONENT))
    if (!scaled.isInteger() || scaled.lte(0)) return undefined
    const units = scaled.toFixed(0)
    return units.length <= MAX_UNITS_DIGITS ? BigInt(units) : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'canonicalAudUnits', reason: 'invalid_response' })
  }
}

export function calculateAudFundingFinancials(input: Readonly<{
  principalUnits: bigint
  serviceFeeBps: number
  taxOnServiceFeeBps: number
}>): Readonly<{
  principalUnits: bigint
  serviceFeeUnits: bigint
  taxUnits: bigint
  totalUnits: bigint
}> {
  if (!canonicalPositiveUnits(input.principalUnits)
    || !basisPoints(input.serviceFeeBps)
    || !basisPoints(input.taxOnServiceFeeBps)) {
    throw new Error('aud_funding_financials_invalid')
  }
  const serviceFeeUnits = roundedBasisPoints(input.principalUnits, input.serviceFeeBps)
  const taxUnits = roundedBasisPoints(serviceFeeUnits, input.taxOnServiceFeeBps)
  return Object.freeze({
    principalUnits: input.principalUnits,
    serviceFeeUnits,
    taxUnits,
    totalUnits: input.principalUnits + serviceFeeUnits + taxUnits,
  })
}

export function quoteAudAccountFunding(principalUnits: bigint, policy: AudFundingPolicy) {
  if (!canonicalPositiveUnits(policy.minimumPrincipalUnits)
    || !canonicalPositiveUnits(policy.maximumPrincipalUnits)
    || !canonicalPositiveUnits(policy.incrementUnits)
    || !canonicalPositiveUnits(policy.legalCustomerMaximumAccessibleUnits)
    || !basisPoints(policy.serviceFeeBps)
    || !basisPoints(policy.taxOnServiceFeeBps)
    || principalUnits < policy.minimumPrincipalUnits
    || principalUnits > policy.maximumPrincipalUnits
    || principalUnits % policy.incrementUnits !== 0n) {
    return undefined
  }
  const calculated = calculateAudFundingFinancials({
    principalUnits,
    serviceFeeBps: policy.serviceFeeBps,
    taxOnServiceFeeBps: policy.taxOnServiceFeeBps,
  })
  const serviceFeeUnits = roundAudUnitsToCent(calculated.serviceFeeUnits)
  const taxUnits = roundAudUnitsToCent(calculated.taxUnits)
  return Object.freeze({
    principalUnits,
    serviceFeeUnits,
    taxUnits,
    totalUnits: principalUnits + serviceFeeUnits + taxUnits,
  })
}

export function roundAudUnitsToCent(units: bigint): bigint {
  return ((units + 5_000n) / 10_000n) * 10_000n
}

export function roundAudStatementTotal(totalUnits: bigint): Readonly<{
  roundedUnits: bigint
  residualUnits: bigint
}> {
  if (totalUnits < 0n) throw new Error('aud_statement_total_invalid')
  const roundedUnits = roundAudUnitsToCent(totalUnits)
  return Object.freeze({ roundedUnits, residualUnits: roundedUnits - totalUnits })
}

function roundedBasisPoints(units: bigint, bps: number): bigint {
  const numerator = units * BigInt(bps)
  return (numerator + (BPS_DENOMINATOR / 2n)) / BPS_DENOMINATOR
}

function canonicalPositiveUnits(units: bigint): boolean {
  return units > 0n && units.toString().length <= MAX_UNITS_DIGITS
}

function basisPoints(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10_000
}
