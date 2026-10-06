import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'

export function promotionalCreditReference(grantRef: string, revision: number, stage: 'grant' | 'expire'): string {
  const digest = canonicalDigest({
    format: 'ae.formance-transaction-reference:v1', value: { grantRef, revision, stage },
  }).slice('sha256:'.length)
  return `ae-p4:${digest}:${stage === 'grant' ? 'promo-grant' : 'promo-expire'}`
}

/** Frozen before the first external reservation; never recompute for recovery. */
export type PromotionalCreditAllocation = Readonly<{
  version: 'ae.promotional-credit-allocation:v1'
  purchasedUnits: string
  grants: Readonly<{ grantRef: string; amountUnits: string; expiresAt: number }>[]
}>

// Bounds one native atomic bulk and one Convex admission transaction. An
// overflowing allocation fails closed instead of silently spending purchased credit.
export const MAX_PROMOTIONAL_GRANTS_PER_CALL = 100

/** Allocate the original Quote's tax only to purchased consideration, in AUD/6. */
export function promotionalPurchasedAmounts(
  buyerAmountUnits: string,
  buyerTaxUnits: string,
  purchasedUnits: string,
): { revenueUnits: string; taxUnits: string } | undefined {
  if (![buyerAmountUnits, buyerTaxUnits, purchasedUnits].every(value => /^(?:0|[1-9]\d{0,15})$/u.test(value))) return undefined
  const [face, tax, purchased] = [BigInt(buyerAmountUnits), BigInt(buyerTaxUnits), BigInt(purchasedUnits)]
  if (face === undefined || tax === undefined || purchased === undefined
    || face <= 0n || face > BigInt(Number.MAX_SAFE_INTEGER) || tax > face || purchased > face) return undefined
  const purchasedTax = tax * purchased / face
  return { revenueUnits: (purchased - purchasedTax).toString(), taxUnits: purchasedTax.toString() }
}

export const promotionalCreditAllocationValue = v.object({
  version: v.literal('ae.promotional-credit-allocation:v1'),
  purchasedUnits: v.string(),
  grants: v.array(v.object({ grantRef: v.string(), amountUnits: v.string(), expiresAt: v.number() })),
})

export const eligiblePromotionalGrantValue = v.object({
  grantRef: v.string(), availableUnits: v.string(), expiresAt: v.number(),
})

export const accountCreditBalanceValue = v.union(
  v.object({
    kind: v.literal('available'), currency: v.literal('AUD'), exponent: v.literal(6),
    units: v.string(), purchasedUnits: v.string(), promotionalUnits: v.string(),
    nextPromotionalExpiryAt: v.union(v.number(), v.null()), observedAt: v.number(),
  }),
  v.object({ kind: v.literal('setup_required'), code: v.string() }),
  v.object({ kind: v.literal('unavailable'), code: v.string() }),
)
export type AccountCreditBalance = Infer<typeof accountCreditBalanceValue>
export type EligiblePromotionalGrant = Infer<typeof eligiblePromotionalGrantValue>

/** Partition already reserved credit without touching grant availability again.
 * Original grant identity/expiry and total units are conserved; invalid or
 * insufficient pools refuse before the caller writes a node reservation. */
export function partitionPromotionalCreditAllocation(pool: PromotionalCreditAllocation, requestedUnits: string):
  { allocated: PromotionalCreditAllocation; remaining: PromotionalCreditAllocation } | undefined {
  const valid = (value: string) => /^(?:0|[1-9]\d{0,15})$/u.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)
  if (pool.version !== 'ae.promotional-credit-allocation:v1' || !valid(pool.purchasedUnits)
    || !valid(requestedUnits) || pool.grants.length > MAX_PROMOTIONAL_GRANTS_PER_CALL
    || new Set(pool.grants.map(grant => grant.grantRef)).size !== pool.grants.length
    || pool.grants.some(grant => !grant.grantRef.trim() || !valid(grant.amountUnits)
      || grant.amountUnits === '0' || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= 0)) return undefined
  let needed = BigInt(requestedUnits)
  const allocated: PromotionalCreditAllocation['grants'] = []
  const remaining: PromotionalCreditAllocation['grants'] = []
  for (const grant of pool.grants) {
    const available = BigInt(grant.amountUnits)
    const taken = available < needed ? available : needed
    if (taken > 0n) allocated.push({ ...grant, amountUnits: taken.toString() })
    if (available > taken) remaining.push({ ...grant, amountUnits: (available - taken).toString() })
    needed -= taken
  }
  if (needed > BigInt(pool.purchasedUnits)) return undefined
  return {
    allocated: { version: pool.version, purchasedUnits: needed.toString(), grants: allocated },
    remaining: { version: pool.version, purchasedUnits: (BigInt(pool.purchasedUnits) - needed).toString(), grants: remaining },
  }
}
