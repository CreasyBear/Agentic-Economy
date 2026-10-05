import { z } from 'zod'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'

export const measurementSupportSchema = z.strictObject({
  state: z.enum(['pending', 'completed', 'refused', 'reconciliation_required', 'cancelled']),
  resultKind: z.enum(['completed', 'pending', 'needs_authority', 'reconciliation_required', 'refused']).nullable(),
  evidenceHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u).nullable(),
  evidenceConflict: z.boolean().default(false),
})
export type MeasurementSupport = z.infer<typeof measurementSupportSchema>
export function measurementSupport(input: { state: MeasurementSupport['state']; result?: { kind: Exclude<MeasurementSupport['resultKind'], null>; evidenceHash?: string }; evidenceHash?: string }): MeasurementSupport {
  const evidence = input.evidenceHash ?? input.result?.evidenceHash
  return { state: input.state, resultKind: input.result?.kind ?? null,
    evidenceConflict: input.evidenceHash !== undefined && input.result?.evidenceHash !== undefined && input.evidenceHash !== input.result.evidenceHash,
    evidenceHash: evidence === undefined ? null : isCanonicalDigest(evidence) ? evidence : canonicalDigest({ unrecognizedEvidence: evidence }) }
}
export const supportDigest = (support: z.input<typeof measurementSupportSchema>) => canonicalDigest({ format: 'ae.measurement-support:v1', ...measurementSupportSchema.parse(support) })
export const supportedQuantity = (support: MeasurementSupport): '1' | null => support.state === 'completed' && support.resultKind === 'completed' && !support.evidenceConflict ? '1' : null
export const measurementRevisionSchema = z.strictObject({
  revisionRef: z.string(), previousRevisionRef: z.string(), revision: z.number().int().positive().max(50),
  sourceDigest: z.string(), support: measurementSupportSchema, quantityUnits: z.literal('1').nullable(),
  effectiveAt: z.number().int().nonnegative().safe(), observedAt: z.number().int().nonnegative().safe(),
})
export type MeasurementRevision = z.infer<typeof measurementRevisionSchema>
export const serviceUsageEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('available'), usageRef: z.string(), callRef: z.string(), unitDefinitionRef: z.literal('delivered_request:v1'),
    originalQuantityUnits: z.literal('1'), currentQuantityUnits: z.literal('1').nullable(), currentRevisionRef: z.string(),
    originalOccurredAt: z.number(), originalObservedAt: z.number(), asOfObservedAt: z.number(), asOfEffectiveAt: z.number(),
    originalSourceDigest: z.string(), revisions: z.array(measurementRevisionSchema).max(50), evidenceDigest: z.string(),
    source: z.literal('canonical_call_support'), authoritativeForMoney: z.literal(false) }),
  z.strictObject({ kind: z.literal('not_recorded') }),
  z.strictObject({ kind: z.literal('not_observed') }),
  z.strictObject({ kind: z.literal('refused'), code: z.string() }),
  z.strictObject({ kind: z.literal('unavailable'), code: z.string() }),
])
export type ServiceUsageEvidence = z.infer<typeof serviceUsageEvidenceSchema>

/** An evidence support revision is not adjudication of actual delivery. Lost
 * canonical support means unknown, never zero; refund fields are absent. */
export function projectServiceUsageEvidence(input: { usageRef: string; callRef: string; occurredAt: number; observedAt: number;
  sourceDigest: string; revisions: MeasurementRevision[]; asOfObservedAt: number; asOfEffectiveAt: number }): ServiceUsageEvidence {
  if (![input.occurredAt, input.observedAt, input.asOfObservedAt, input.asOfEffectiveAt].every(time => Number.isSafeInteger(time) && time >= 0)
    || input.observedAt < input.occurredAt || !isCanonicalDigest(input.sourceDigest)) throw new Error('measurement_origin_invalid')
  if (input.revisions.length > 50) throw new Error('measurement_lineage_too_large')
  let previous = input.usageRef, lastObserved = input.observedAt
  for (const [index, raw] of input.revisions.entries()) {
    const row = measurementRevisionSchema.parse(raw)
    const expected = `service-usage-revision:${canonicalDigest({ usageRef: input.usageRef, previousRevisionRef: previous, sourceDigest: row.sourceDigest })}`
    if (row.revision !== index + 1 || row.previousRevisionRef !== previous || row.revisionRef !== expected
      || row.sourceDigest !== supportDigest(row.support) || row.quantityUnits !== supportedQuantity(row.support)
      || row.observedAt < lastObserved || row.effectiveAt < input.occurredAt) throw new Error('measurement_lineage_invalid')
    previous = row.revisionRef; lastObserved = row.observedAt
  }
  if (input.observedAt > input.asOfObservedAt || input.occurredAt > input.asOfEffectiveAt) return { kind: 'not_observed' }
  const revisions = input.revisions.filter(row => row.observedAt <= input.asOfObservedAt && row.effectiveAt <= input.asOfEffectiveAt)
  const last = revisions.at(-1)
  const material = { usageRef: input.usageRef, callRef: input.callRef, unitDefinitionRef: 'delivered_request:v1' as const,
    originalQuantityUnits: '1' as const, currentQuantityUnits: last === undefined ? '1' as const : last.quantityUnits,
    currentRevisionRef: last?.revisionRef ?? input.usageRef, originalOccurredAt: input.occurredAt, originalObservedAt: input.observedAt,
    asOfObservedAt: input.asOfObservedAt, asOfEffectiveAt: input.asOfEffectiveAt, originalSourceDigest: input.sourceDigest, revisions }
  return { kind: 'available', ...material, evidenceDigest: canonicalDigest({ format: 'ae.service-usage-evidence:v1', ...material }),
    source: 'canonical_call_support', authoritativeForMoney: false }
}
