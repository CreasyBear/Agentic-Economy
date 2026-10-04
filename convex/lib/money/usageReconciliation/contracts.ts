import { v } from 'convex/values'

export const periodArgs = { periodStartAt: v.number(), periodEndAt: v.number() }
const nullableString = v.union(v.string(), v.null())
export const financialEntryValue = v.object({
  transactionId: v.string(), transactionRef: nullableString, callDigest: nullableString, providerDigest: nullableString,
  kind: v.union(v.literal('charge'), v.literal('refund'), v.literal('promotional_use'), v.literal('promotional_refund'), v.literal('provider_transfer'), v.literal('provider_reversal'), v.literal('unsupported')),
  units: nullableString, occurredAt: v.number(), recordedAt: v.union(v.number(), v.null()), reverted: v.boolean(),
})
export const failureValues = [
  v.object({ kind: v.literal('setup_required'), code: v.string() }),
  v.object({ kind: v.literal('unavailable'), code: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
] as const
export const financialReadResult = v.union(v.object({ kind: v.literal('available'), entries: v.array(financialEntryValue), snapshotAt: v.number(), coverage: v.union(v.literal('complete'), v.literal('partial')) }), ...failureValues.slice(0,2))
export const callFactValue = v.object({
  callRef: v.string(), credentialRef: v.string(), principalRef: v.string(), createdAt: v.number(),
  environment: v.union(v.literal('sandbox'), v.literal('production')), providerDigest: nullableString,
  settlementRefs: v.array(v.string()), refundRefs: v.array(v.string()), providerSettlementRef: nullableString, providerReversalRef: nullableString,
  providerObligationUnits: nullableString,
})
export const factsArgs = { ...periodArgs, entries: v.array(financialEntryValue) }
export const factsResult = v.union(v.object({ kind: v.literal('available'), accountRef: v.string(), calls: v.array(callFactValue), sources: v.array(nullableString) }), ...failureValues)
const totalsValue = v.object({ grossChargeUnits: v.string(), refundUnits: v.string(), netChargeUnits: v.string(), promotionalUseUnits: v.string(), promotionalRefundUnits: v.string(), netPromotionalUseUnits: v.string(), providerTransferUnits: v.string(), providerReversalUnits: v.string(), netProviderTransferUnits: v.string() })
export const reconciliationResult = v.union(v.object({
  kind: v.literal('available'), ...periodArgs, snapshotAt: v.number(), timeBasis: v.literal('financial_effective'),
  currency: v.literal('AUD'), providerCurrency: v.literal('USDC'), exponent: v.literal(6), totals: totalsValue,
  amountCoverage: v.union(v.literal('complete'), v.literal('partial')), attributionCoverage: v.union(v.literal('complete'), v.literal('partial')),
  transactionCountUnits: v.string(), unattributedTransactionCountUnits: v.string(),
  entries: v.array(v.object({ transactionId: v.string(), kind: financialEntryValue.fields.kind, units: nullableString, currency: v.union(v.literal('AUD'), v.literal('USDC'), v.null()), occurredAt: v.number(), recordedAt: v.union(v.number(), v.null()), callRef: nullableString, credentialRef: nullableString, reverted: v.boolean() })),
  bridge: v.array(v.object({ callCreated: v.union(v.literal('before_period'), v.literal('in_period'), v.literal('after_period'), v.literal('unattributed')), totals: totalsValue })),
  credentials: v.array(v.object({ credentialRef: v.string(), principalRefs: v.array(v.string()), totals: totalsValue, linkedCallCountUnits: v.string(), createdCallCountUnits: v.string(), sandboxCreatedCallCountUnits: v.string(), providerObligationUnits: v.string(), unknownProviderObligationCallCountUnits: v.string() })),
  createdCallCountUnits: v.string(), createdCallProviderObligationUnits: v.string(), unknownProviderObligationCallCountUnits: v.string(),
  authoritativeForConsequences: v.literal(false), source: v.literal('formance_with_canonical_call_joins'),
}), ...failureValues)
