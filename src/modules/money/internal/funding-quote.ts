import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  calculateCreditTopupFinancials,
  productionCreditTopupConfig,
  type CreditTopupConfig,
} from './topup'
import { exactAmountSchema, type ExactAmount } from './exact-amount'

export const FUNDING_QUOTE_CONTRACT_VERSION = 'ae-funding-quote:v1' as const
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
  currency: z.string(),
  minimum: exactAmountSchema,
  maximum: exactAmountSchema,
  increment: exactAmountSchema,
  processingFeeBps: z.number().int().min(0).max(10_000),
  amountMeaning: z.literal('buyer_credit_before_processing_fee'),
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
  creditAmount: exactAmountSchema,
  processingFee: exactAmountSchema,
  totalCharge: exactAmountSchema,
  processingFeeBps: z.number().int().min(0).max(10_000),
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

export function readFundingConstraints(
  config: CreditTopupConfig = productionCreditTopupConfig(),
): FundingConstraints | undefined {
  const entries = Object.entries(config.minimumByCurrency)
  if (entries.length !== 1) return undefined
  const [currency, minimum] = entries[0] ?? []
  if (currency === undefined || minimum === undefined) return undefined
  const maximum = config.maximumByCurrency[currency]
  const processingFeeBps = config.topupFeeBps ?? 500
  if (
    maximum === undefined
    || minimum.currency !== currency
    || maximum.currency !== currency
    || minimum.exponent !== maximum.exponent
    || !Number.isSafeInteger(processingFeeBps)
    || processingFeeBps < 0
    || processingFeeBps > 10_000
  ) return undefined

  return {
    kind: 'funding_constraints',
    contractVersion: FUNDING_QUOTE_CONTRACT_VERSION,
    currency,
    minimum,
    maximum,
    increment: { currency, units: '1', exponent: minimum.exponent },
    processingFeeBps,
    amountMeaning: 'buyer_credit_before_processing_fee',
    quotePath: FUNDING_QUOTE_PATH,
  }
}

export function quoteFunding(input: Readonly<{
  amount: ExactAmount
  now: number
  config?: CreditTopupConfig
}>): FundingQuote | undefined {
  const config = input.config ?? productionCreditTopupConfig()
  const constraints = readFundingConstraints(config)
  if (constraints === undefined || !Number.isSafeInteger(input.now) || input.now < 0) return undefined
  const financials = calculateCreditTopupFinancials({
    amount: input.amount,
    accountCurrency: constraints.currency,
    accountExponent: constraints.minimum.exponent,
    config,
  })
  if (financials === undefined) return undefined
  const generatedAt = input.now
  const expiresAt = generatedAt + FUNDING_QUOTE_VALIDITY_MS
  const quoteMaterial = {
    format: FUNDING_QUOTE_CONTRACT_VERSION,
    creditAmount: financials.amount,
    processingFee: financials.processingFee,
    totalCharge: financials.chargeAmount,
    processingFeeBps: constraints.processingFeeBps,
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
    creditAmount: financials.amount,
    processingFee: financials.processingFee,
    totalCharge: financials.chargeAmount,
    processingFeeBps: constraints.processingFeeBps,
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
