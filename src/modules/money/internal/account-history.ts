import { z } from 'zod'

const signedUnits = z.string().regex(/^(?:0|-?[1-9]\d*)$/u)
export const accountHistoryEntrySchema = z.strictObject({
  transactionId: z.string().regex(/^\d+$/u),
  transactionRef: z.string().nullable(),
  occurredAt: z.number().int().nonnegative(),
  recordedAt: z.number().int().nonnegative().nullable(),
  kind: z.enum(['funding', 'funding_reversal', 'call_spend', 'call_refund', 'promotional_refund', 'document_adjustment', 'promotional_grant', 'promotional_use', 'promotional_expiry', 'unmapped']),
  /** Available plus reserved customer credit; internal reservations net to zero. */
  accountEffect: z.strictObject({ currency: z.literal('AUD'), units: signedUnits, exponent: z.literal(6) }),
  /** Document rounding is separate and never changes spendable credit. */
  documentEffectUnits: signedUnits,
  reverted: z.boolean(),
  revertedAt: z.number().int().nonnegative().nullable(),
  /** Raw owner-authorized CallRef only when a settled buyer-sale join is proven. */
  sourceRef: z.string().nullable(),
  sourceDigest: z.string().nullable(),
})
export const accountHistoryResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('available'), entries: z.array(accountHistoryEntrySchema),
    snapshotAt: z.number().int().nonnegative(), continueCursor: z.string(), isDone: z.boolean(),
    /** Cumulative attribution/netting coverage; isDone separately describes traversal. */
    coverage: z.enum(['complete', 'partial']),
    /** Per-page buyer-sale Call attribution; other transaction kinds have no implied Call. */
    sourceLinkCoverage: z.enum(['complete', 'partial', 'unavailable']),
    source: z.literal('formance_transaction_cursor'),
    ordering: z.literal('recorded_transaction_sequence_desc'),
  }),
  z.strictObject({ kind: z.literal('setup_required'), code: z.string() }),
  z.strictObject({ kind: z.literal('unavailable'), code: z.string() }),
  z.strictObject({ kind: z.literal('refused'), code: z.string() }),
])
export type AccountHistoryEntry = z.infer<typeof accountHistoryEntrySchema>
export type AccountHistoryResult = z.infer<typeof accountHistoryResultSchema>

export const accountHistoryCursorSchema = z.strictObject({
  accountDigest: z.string().regex(/^[a-f0-9]{64}$/u), ledger: z.string(),
  snapshotAt: z.number().int().nonnegative(), cursor: z.string().min(1).max(2000),
  lastId: z.string().regex(/^\d+$/u),
  coverage: z.enum(['complete', 'partial']),
})
