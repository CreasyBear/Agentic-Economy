import { v, type Infer } from 'convex/values'

export const monthlySaleValue = v.object({ reference: v.string(), units: v.string(), effectiveAt: v.number() })

// Internal, provisional evidence only. The admission mutation reads the current
// budget and source fingerprint again before inserting a Call or claiming a Hold.
export const monthlySpendSnapshotValue = v.object({
  enabled: v.boolean(), ceilingUnits: v.optional(v.string()), monthSpendUnits: v.optional(v.string()),
  organizationMonth: v.optional(v.string()), exposureDigest: v.optional(v.string()),
  snapshotAt: v.optional(v.number()), coverage: v.optional(v.literal('complete')),
  sales: v.optional(v.array(monthlySaleValue)),
})

export const accountExposureArgs = {
  accountRef: v.string(), environment: v.union(v.literal('sandbox'), v.literal('production')), organizationMonth: v.string(),
}
export const accountExposureResult = v.union(
  v.object({ kind: v.literal('available'), units: v.string(), digest: v.string(),
    saleAllocations: v.array(v.object({ reference: v.string(), units: v.string(), groupRef: v.string(), groupUnits: v.string() })),
  }),
  v.object({ kind: v.literal('unavailable') }),
)
export type AccountExposure = Infer<typeof accountExposureResult>
export type MonthlySpendSnapshot = Infer<typeof monthlySpendSnapshotValue>
export const MAX_MONTHLY_EXPOSURE_SOURCES = 1_000
export function validExposureUnits(units: string | undefined): units is string {
  return typeof units === 'string' && /^(?:0|[1-9]\d{0,30})$/u.test(units)
}

/** Subtract only native sales still represented in a held Call or Plan amount.
 * A concluded Plan Node is deliberately absent from saleAllocations.
 */
export function remainingMonthlyExposure(
  held: AccountExposure,
  snapshot: MonthlySpendSnapshot,
): { kind: 'known'; units: string } | { kind: 'unavailable' } {
  if (held.kind !== 'available' || snapshot.coverage !== 'complete' || snapshot.sales === undefined
    || snapshot.sales.length > 8_000 || !validExposureUnits(snapshot.monthSpendUnits)
    || !validExposureUnits(held.units) || snapshot.organizationMonth === undefined) return { kind: 'unavailable' }
  const sales = new Map<string, string>()
  let total = 0n
  for (const sale of snapshot.sales) {
    if (sales.has(sale.reference) || !validExposureUnits(sale.units) || sale.units === '0'
      || !Number.isSafeInteger(sale.effectiveAt) || sale.effectiveAt < 0
      || new Date(sale.effectiveAt).toISOString().slice(0, 7) !== snapshot.organizationMonth) return { kind: 'unavailable' }
    sales.set(sale.reference, sale.units)
    total += BigInt(sale.units)
  }
  if (total !== BigInt(snapshot.monthSpendUnits)) return { kind: 'unavailable' }
  let overlap = 0n
  const deducted = new Set<string>()
  const groups = new Map<string, bigint>()
  for (const allocation of held.saleAllocations) {
    const sold = sales.get(allocation.reference)
    if (sold === undefined) continue
    if (deducted.has(allocation.reference) || sold !== allocation.units || !validExposureUnits(allocation.groupUnits)) return { kind: 'unavailable' }
    deducted.add(allocation.reference)
    const groupOverlap = (groups.get(allocation.groupRef) ?? 0n) + BigInt(sold)
    if (groupOverlap > BigInt(allocation.groupUnits)) return { kind: 'unavailable' }
    groups.set(allocation.groupRef, groupOverlap)
    overlap += BigInt(sold)
  }
  return overlap > BigInt(held.units) ? { kind: 'unavailable' } : { kind: 'known', units: (BigInt(held.units) - overlap).toString() }
}
