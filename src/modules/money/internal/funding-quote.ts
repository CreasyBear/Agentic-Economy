import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'

import { exactAmountSchema, type ExactAmount } from './exact-amount'
import {
  AUD_EXPONENT,
  audFundingPolicyFromCommercialControls,
  quoteAudAccountFunding,
} from './aud-funding'
import { SANDBOX_COMMERCIAL_POLICY_CONTROLS } from './commercial-policy'

export const FUNDING_QUOTE_CONTRACT_VERSION = 'ae-funding-quote:v2' as const
export const FUNDING_QUOTE_VALIDITY_MS = 5 * 60 * 1_000
export const FUNDING_CONSTRAINTS_PATH = '/api/v1/funding/constraints' as const
export const FUNDING_QUOTE_PATH = '/api/v1/funding/quote' as const

export const fundingQuoteInputSchema = z.strictObject({
  amount: exactAmountSchema,
})

export type FundingQuoteInput = z.infer<typeof fundingQuoteInputSchema>

export const fundingConstraintsSchema = z.strictObject({
  kind: z.literal('funding_constraints'),
  contractVersion: z.literal(FUNDING_QUOTE_CONTRACT_VERSION),
  currency: z.literal('AUD'),
  minimum: exactAmountSchema,
  maximum: exactAmountSchema,
  increment: exactAmountSchema,
  serviceFeeBps: z.number().int().min(0).max(10_000),
  taxOnServiceFeeBps: z.number().int().min(0).max(10_000),
  amountMeaning: z.literal('account_aud_principal'),
  quotePath: z.literal(FUNDING_QUOTE_PATH),
})

export type FundingConstraints = Readonly<z.infer<typeof fundingConstraintsSchema>>

export const fundingQuoteSchema = z.strictObject({
  kind: z.literal('funding_quote'),
  contractVersion: z.literal(FUNDING_QUOTE_CONTRACT_VERSION),
  quoteRef: z.string().min(1),
  binding: z.literal(false),
  generatedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  principalAmount: exactAmountSchema,
  serviceFee: exactAmountSchema,
  taxOnServiceFee: exactAmountSchema,
  totalPayment: exactAmountSchema,
  serviceFeeBps: z.number().int().min(0).max(10_000),
  taxOnServiceFeeBps: z.number().int().min(0).max(10_000),
  nextActions: z.tuple([z.strictObject({
    action: z.literal('funding.create'),
    kind: z.literal('human_handoff'),
    method: z.literal('GET'),
    href: z.literal('/owner/credit'),
    requiresFreshHumanAuthority: z.literal(true),
    consequence: z.literal('opens_secure_payment_creation'),
    retryClass: z.literal('safe_before_payment_submit'),
  })]),
})

export type FundingQuote = Readonly<z.infer<typeof fundingQuoteSchema>>

export const FUNDING_PREFLIGHT_ROUTE_CONTRACTS = Object.freeze([
  {
    label: 'Read funding constraints',
    method: 'GET',
    path: FUNDING_CONSTRAINTS_PATH,
    contractVersion: FUNDING_QUOTE_CONTRACT_VERSION,
    outputSchema: fundingConstraintsSchema,
  },
  {
    label: 'Quote account funding',
    method: 'POST',
    path: FUNDING_QUOTE_PATH,
    contractVersion: FUNDING_QUOTE_CONTRACT_VERSION,
    inputSchema: fundingQuoteInputSchema,
    outputSchema: fundingQuoteSchema,
  },
] as const)

export function readFundingConstraints(): FundingConstraints {
  const policy = audFundingPolicyFromCommercialControls(SANDBOX_COMMERCIAL_POLICY_CONTROLS)
  return {
    kind: 'funding_constraints',
    contractVersion: FUNDING_QUOTE_CONTRACT_VERSION,
    currency: 'AUD',
    minimum: exactAudAmount(policy.minimumPrincipalUnits),
    maximum: exactAudAmount(policy.maximumPrincipalUnits),
    increment: exactAudAmount(policy.incrementUnits),
    serviceFeeBps: policy.serviceFeeBps,
    taxOnServiceFeeBps: policy.taxOnServiceFeeBps,
    amountMeaning: 'account_aud_principal',
    quotePath: FUNDING_QUOTE_PATH,
  }
}

export function quoteFunding(input: Readonly<{
  amount: ExactAmount
  now: number
}>): FundingQuote | undefined {
  const constraints = readFundingConstraints()
  if (!Number.isSafeInteger(input.now)
    || input.now < 0
    || input.amount.currency !== 'AUD'
    || input.amount.exponent !== AUD_EXPONENT) return undefined
  const financials = quoteAudAccountFunding(
    BigInt(input.amount.units),
    audFundingPolicyFromCommercialControls(SANDBOX_COMMERCIAL_POLICY_CONTROLS),
  )
  if (financials === undefined) return undefined
  const generatedAt = input.now
  const expiresAt = generatedAt + FUNDING_QUOTE_VALIDITY_MS
  const quoteMaterial = {
    format: FUNDING_QUOTE_CONTRACT_VERSION,
    principalAmount: exactAudAmount(financials.principalUnits),
    serviceFee: exactAudAmount(financials.serviceFeeUnits),
    taxOnServiceFee: exactAudAmount(financials.taxUnits),
    totalPayment: exactAudAmount(financials.totalUnits),
    serviceFeeBps: constraints.serviceFeeBps,
    taxOnServiceFeeBps: constraints.taxOnServiceFeeBps,
    generatedAt,
    expiresAt,
  } as const

  return {
    kind: 'funding_quote',
    contractVersion: FUNDING_QUOTE_CONTRACT_VERSION,
    quoteRef: canonicalDigest(quoteMaterial),
    binding: false,
    generatedAt,
    expiresAt,
    principalAmount: exactAudAmount(financials.principalUnits),
    serviceFee: exactAudAmount(financials.serviceFeeUnits),
    taxOnServiceFee: exactAudAmount(financials.taxUnits),
    totalPayment: exactAudAmount(financials.totalUnits),
    serviceFeeBps: constraints.serviceFeeBps,
    taxOnServiceFeeBps: constraints.taxOnServiceFeeBps,
    nextActions: [{
      action: 'funding.create',
      kind: 'human_handoff',
      method: 'GET',
      href: '/owner/credit',
      requiresFreshHumanAuthority: true,
      consequence: 'opens_secure_payment_creation',
      retryClass: 'safe_before_payment_submit',
    }],
  }
}

function exactAudAmount(units: bigint): ExactAmount {
  return { currency: 'AUD', units: units.toString(), exponent: AUD_EXPONENT }
}
