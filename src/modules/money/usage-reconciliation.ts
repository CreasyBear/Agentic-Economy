import { z } from 'zod'
import { digestReference } from './internal/formance-digest'

const units = z.string().regex(/^(?:0|[1-9]\d*)$/u)
const signedUnits = z.string().regex(/^(?:0|-?[1-9]\d*)$/u)
export const reconciliationPeriodSchema = z.strictObject({
  periodStartAt: z.number().int().nonnegative().safe(), periodEndAt: z.number().int().positive().safe(),
}).refine(p => p.periodEndAt > p.periodStartAt && p.periodEndAt - p.periodStartAt <= 366 * 86400_000, 'usage_period_invalid')
export const financialUsageEntrySchema = z.strictObject({
  transactionId: units, transactionRef: z.string().max(100).nullable(), callDigest: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  providerDigest: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  kind: z.enum(['charge', 'refund', 'promotional_use', 'promotional_refund', 'provider_transfer', 'provider_reversal', 'unsupported']),
  units: units.nullable(), occurredAt: z.number().int().nonnegative().safe(), recordedAt: z.number().int().nonnegative().safe().nullable(),
  reverted: z.boolean(),
})
export type FinancialUsageEntry = z.infer<typeof financialUsageEntrySchema>
export const financialUsageReadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('available'), entries: z.array(financialUsageEntrySchema).max(1500), snapshotAt: z.number(), coverage: z.enum(['complete', 'partial']) }),
  z.strictObject({ kind: z.literal('setup_required'), code: z.string() }),
  z.strictObject({ kind: z.literal('unavailable'), code: z.string() }),
])
export type FinancialUsageRead = z.infer<typeof financialUsageReadSchema>
export const reconciliationCallSchema = z.strictObject({
  callRef: z.string(), credentialRef: z.string().max(200), principalRef: z.string().max(200), createdAt: z.number(),
  environment: z.enum(['sandbox', 'production']), providerDigest: z.string().nullable(),
  settlementRefs: z.array(z.string()).max(100), refundRefs: z.array(z.string()).max(100),
  providerSettlementRef: z.string().nullable(), providerReversalRef: z.string().nullable(),
  providerObligationUnits: units.nullable(),
})
export type ReconciliationCall = z.infer<typeof reconciliationCallSchema>
const totalsSchema = z.strictObject({
  grossChargeUnits: units, refundUnits: units, netChargeUnits: signedUnits,
  promotionalUseUnits: units, promotionalRefundUnits: units, netPromotionalUseUnits: signedUnits,
  providerTransferUnits: units, providerReversalUnits: units, netProviderTransferUnits: signedUnits,
})
export const usageReconciliationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('available'), periodStartAt: z.number(), periodEndAt: z.number(), snapshotAt: z.number(),
    timeBasis: z.literal('financial_effective'), currency: z.literal('AUD'), providerCurrency: z.literal('USDC'), exponent: z.literal(6),
    totals: totalsSchema, amountCoverage: z.enum(['complete', 'partial']), attributionCoverage: z.enum(['complete', 'partial']),
    transactionCountUnits: units, unattributedTransactionCountUnits: units,
    entries: z.array(z.strictObject({ transactionId: units, kind: financialUsageEntrySchema.shape.kind, units: units.nullable(),
      currency: z.enum(['AUD', 'USDC']).nullable(), occurredAt: z.number(), recordedAt: z.number().nullable(),
      callRef: z.string().nullable(), credentialRef: z.string().nullable(), reverted: z.boolean() })).max(1500),
    bridge: z.array(z.strictObject({ callCreated: z.enum(['before_period', 'in_period', 'after_period', 'unattributed']), totals: totalsSchema })),
    credentials: z.array(z.strictObject({ credentialRef: z.string(), principalRefs: z.array(z.string()), totals: totalsSchema,
      linkedCallCountUnits: units, createdCallCountUnits: units, sandboxCreatedCallCountUnits: units,
      providerObligationUnits: units, unknownProviderObligationCallCountUnits: units })),
    createdCallCountUnits: units, createdCallProviderObligationUnits: units, unknownProviderObligationCallCountUnits: units,
    authoritativeForConsequences: z.literal(false), source: z.literal('formance_with_canonical_call_joins'),
  }),
  z.strictObject({ kind: z.literal('setup_required'), code: z.string() }),
  z.strictObject({ kind: z.literal('unavailable'), code: z.string() }),
  z.strictObject({ kind: z.literal('refused'), code: z.string() }),
])
export type UsageReconciliation = z.infer<typeof usageReconciliationSchema>
type Totals = z.infer<typeof totalsSchema>
const zero = (): Totals => ({ grossChargeUnits: '0', refundUnits: '0', netChargeUnits: '0', promotionalUseUnits: '0', promotionalRefundUnits: '0', netPromotionalUseUnits: '0', providerTransferUnits: '0', providerReversalUnits: '0', netProviderTransferUnits: '0' })
const fields = { charge: 'grossChargeUnits', refund: 'refundUnits', promotional_use: 'promotionalUseUnits', promotional_refund: 'promotionalRefundUnits', provider_transfer: 'providerTransferUnits', provider_reversal: 'providerReversalUnits' } as const
function add(totals: Totals, entry: FinancialUsageEntry) {
  if (entry.kind === 'unsupported' || entry.units === null) throw new Error('reconciliation_amount_invalid')
  const field = fields[entry.kind]
  totals[field] = (BigInt(totals[field]) + BigInt(entry.units)).toString()
  totals.netChargeUnits = (BigInt(totals.grossChargeUnits) - BigInt(totals.refundUnits)).toString()
  totals.netPromotionalUseUnits = (BigInt(totals.promotionalUseUnits) - BigInt(totals.promotionalRefundUnits)).toString()
  totals.netProviderTransferUnits = (BigInt(totals.providerTransferUnits) - BigInt(totals.providerReversalUnits)).toString()
}

/** Read projection only: separate assets and credit classes; never alter postings,
 * infer exchange rates, subtract provider pass-through twice, or authorize money. */
export function reconcileUsage(input: { periodStartAt: number; periodEndAt: number; financial: Extract<FinancialUsageRead, { kind: 'available' }>;
  calls: ReconciliationCall[]; sources: (string | null)[] }): Extract<UsageReconciliation, { kind: 'available' }> {
  const { financial, periodStartAt, periodEndAt } = input
  if (input.sources.length !== financial.entries.length) throw new Error('reconciliation_sources_invalid')
  const calls = new Map(input.calls.map(call => [call.callRef, call]))
  if (calls.size !== input.calls.length) throw new Error('reconciliation_call_conflict')
  const totals = zero()
  const bridge = (['before_period', 'in_period', 'after_period', 'unattributed'] as const).map(callCreated => ({ callCreated, totals: zero() }))
  const credentials = new Map<string, { credentialRef: string; principalRefs: string[]; totals: Totals; linkedCalls: Set<string>; createdCallCountUnits: string;
    sandboxCreatedCallCountUnits: string; providerObligationUnits: string; unknownProviderObligationCallCountUnits: string }>()
  const credential = (call: ReconciliationCall) => {
    let row = credentials.get(call.credentialRef)
    if (!row) {
      row = { credentialRef: call.credentialRef, principalRefs: [], totals: zero(), linkedCalls: new Set(), createdCallCountUnits: '0',
        sandboxCreatedCallCountUnits: '0', providerObligationUnits: '0', unknownProviderObligationCallCountUnits: '0' }
      credentials.set(call.credentialRef, row)
    }
    if (!row.principalRefs.includes(call.principalRef)) row.principalRefs.push(call.principalRef)
    return row
  }
  let unknown = 0n
  let created = 0n
  let obligations = 0n
  for (const call of input.calls) if (call.createdAt >= periodStartAt && call.createdAt < periodEndAt) {
    const row = credential(call)
    created += 1n
    row.createdCallCountUnits = (BigInt(row.createdCallCountUnits) + 1n).toString()
    if (call.environment === 'sandbox') row.sandboxCreatedCallCountUnits = (BigInt(row.sandboxCreatedCallCountUnits) + 1n).toString()
    if (call.providerObligationUnits === null) { unknown += 1n; row.unknownProviderObligationCallCountUnits = (BigInt(row.unknownProviderObligationCallCountUnits) + 1n).toString() }
    else { obligations += BigInt(call.providerObligationUnits); row.providerObligationUnits = (BigInt(row.providerObligationUnits) + BigInt(call.providerObligationUnits)).toString() }
  }
  const ids = new Set<string>()
  const refs = new Set<string>()
  const records: Extract<UsageReconciliation, {kind:'available'}>['entries'] = []
  let unattributed = 0n
  let coverage = financial.coverage
  for (const [index, entry] of financial.entries.entries()) {
    if (ids.has(entry.transactionId) || (entry.transactionRef !== null && refs.has(entry.transactionRef))) throw new Error('reconciliation_duplicate_transaction')
    ids.add(entry.transactionId)
    if (entry.transactionRef !== null) refs.add(entry.transactionRef)
    if (entry.occurredAt < periodStartAt || entry.occurredAt >= periodEndAt || entry.occurredAt > financial.snapshotAt
      || (entry.recordedAt !== null && entry.recordedAt > financial.snapshotAt)) throw new Error('reconciliation_period_invalid')
    if (entry.kind === 'unsupported') {
      coverage = 'partial'; unattributed += 1n
      records.push({ transactionId: entry.transactionId, kind: entry.kind, units: null, currency: null, occurredAt: entry.occurredAt, recordedAt: entry.recordedAt, callRef: null, credentialRef: null, reverted: entry.reverted })
      continue
    }
    // Reverted originals do not prove a current net amount. Keep measured subset labelled partial.
    if (entry.reverted) { coverage = 'partial'; records.push({ transactionId: entry.transactionId, kind: entry.kind, units: entry.units, currency: entry.kind.startsWith('provider_') ? 'USDC' : 'AUD', occurredAt: entry.occurredAt, recordedAt: entry.recordedAt, callRef: null, credentialRef: null, reverted: true }); continue }
    add(totals, entry)
    const source = input.sources[index]
    const call = source == null ? undefined : calls.get(source)
    const valid = call !== undefined && entry.callDigest === digestReference('call', call.callRef) && entry.transactionRef !== null && (
      (entry.kind === 'charge' || entry.kind === 'promotional_use') ? call.settlementRefs.includes(entry.transactionRef)
        : (entry.kind === 'refund' || entry.kind === 'promotional_refund') ? call.refundRefs.includes(entry.transactionRef)
          : entry.kind === 'provider_transfer' ? call.providerSettlementRef === entry.transactionRef && call.providerDigest === entry.providerDigest && call.providerObligationUnits === entry.units
            : call.providerReversalRef === entry.transactionRef && call.providerDigest === entry.providerDigest && call.providerObligationUnits === entry.units)
    records.push({ transactionId: entry.transactionId, kind: entry.kind, units: entry.units, currency: entry.kind.startsWith('provider_') ? 'USDC' : 'AUD', occurredAt: entry.occurredAt, recordedAt: entry.recordedAt, callRef: valid && call ? call.callRef : null, credentialRef: valid && call ? call.credentialRef : null, reverted: false })
    const bucket = valid && call ? call.createdAt < periodStartAt ? 0 : call.createdAt < periodEndAt ? 1 : 2 : 3
    const bridgeRow = bridge[bucket]
    if (!bridgeRow) throw new Error('reconciliation_bridge_invalid')
    add(bridgeRow.totals, entry)
    if (!valid || !call) { unattributed += 1n; continue }
    const row = credential(call)
    row.linkedCalls.add(call.callRef)
    add(row.totals, entry)
  }
  return { kind: 'available', periodStartAt, periodEndAt, snapshotAt: financial.snapshotAt,
    timeBasis: 'financial_effective', currency: 'AUD', providerCurrency: 'USDC', exponent: 6,
    totals, amountCoverage: coverage, attributionCoverage: unattributed === 0n ? 'complete' : 'partial',
    entries: records, transactionCountUnits: String(financial.entries.length), unattributedTransactionCountUnits: unattributed.toString(), bridge,
    credentials: [...credentials.values()].sort((a,b) => a.credentialRef.localeCompare(b.credentialRef)).map(({ linkedCalls, ...row }) => ({ ...row, principalRefs: row.principalRefs.sort(), linkedCallCountUnits: String(linkedCalls.size) })),
    createdCallCountUnits: created.toString(), createdCallProviderObligationUnits: obligations.toString(), unknownProviderObligationCallCountUnits: unknown.toString(),
    authoritativeForConsequences: false, source: 'formance_with_canonical_call_joins' }
}
