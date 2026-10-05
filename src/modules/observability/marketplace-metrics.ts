import { v, type Infer } from 'convex/values'

export const marketplaceFundingValue = v.object({
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  purchasedUnits: v.string(),
  promotionalUnits: v.string(),
  refundedPurchasedUnits: v.string(),
  customerFundedCalls: v.number(),
  promotionalOnlyCalls: v.number(),
  completedCustomerFundedCalls: v.number(),
  buyingAccounts: v.number(),
  unclassifiedCalls: v.number(),
  refundedCalls: v.number(),
})

export type MarketplaceFunding = Infer<typeof marketplaceFundingValue>
export const callFundingValue = v.union(
  v.object({ kind: v.union(v.literal('settled'), v.literal('refunded')), purchasedUnits: v.string(), promotionalUnits: v.string() }),
  v.object({ kind: v.union(v.literal('free'), v.literal('unsettled'), v.literal('unclassified')) }),
)
export type CallFunding =
  | Readonly<{ kind: 'settled' | 'refunded'; purchasedUnits: string; promotionalUnits: string }>
  | Readonly<{ kind: 'free' }>
  | Readonly<{ kind: 'unsettled' }>
  | Readonly<{ kind: 'unclassified' }>

type FundingSource = Readonly<{
  usage?: Readonly<{
    chargeState: string
    amount: Readonly<{ currency: string; exponent: number; units: string }>
  }>
  promotionalCreditAllocation?: Readonly<{
    purchasedUnits: string
    grants: readonly Readonly<{ amountUnits: string }>[]
  }>
}>

const unitsValid = (value: string) => /^(?:0|[1-9]\d{0,15})$/u.test(value)
  && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)

/** Requires a stored Call's usage and frozen allocation, never browser claims.
 * Ensures classified AUD/6 parts exactly equal the recorded face amount.
 * Invariant: refunds and promotional-only use never become purchased activity.
 * On violation: retain unclassified evidence; do not infer purchased funding. */
export function classifyCallFunding(source: FundingSource): CallFunding {
  const usage = source.usage
  if (usage?.chargeState === 'free_tier') return { kind: 'free' }
  if (usage?.chargeState !== 'paid' && usage?.chargeState !== 'refunded') return { kind: 'unsettled' }
  const allocation = source.promotionalCreditAllocation
  if (usage.amount.currency !== 'AUD' || usage.amount.exponent !== 6
    || !unitsValid(usage.amount.units) || allocation === undefined
    || !unitsValid(allocation.purchasedUnits) || allocation.grants.length > 100
    || allocation.grants.some(grant => !unitsValid(grant.amountUnits))) return { kind: 'unclassified' }
  const promotional = allocation.grants.reduce((sum, grant) => sum + BigInt(grant.amountUnits), 0n)
  if (BigInt(allocation.purchasedUnits) + promotional !== BigInt(usage.amount.units)) return { kind: 'unclassified' }
  return {
    kind: usage.chargeState === 'paid' ? 'settled' : 'refunded',
    purchasedUnits: allocation.purchasedUnits,
    promotionalUnits: promotional.toString(),
  }
}

export function emptyMarketplaceFunding(environment: MarketplaceFunding['environment']): MarketplaceFunding {
  return { environment, purchasedUnits: '0', promotionalUnits: '0', refundedPurchasedUnits: '0',
    customerFundedCalls: 0, promotionalOnlyCalls: 0, completedCustomerFundedCalls: 0,
    buyingAccounts: 0, unclassifiedCalls: 0, refundedCalls: 0 }
}
