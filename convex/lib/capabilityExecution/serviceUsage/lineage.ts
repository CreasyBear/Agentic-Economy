import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { measurementSupport, supportDigest, supportedQuantity, projectServiceUsageEvidence, type MeasurementSupport, type ServiceUsageEvidence } from '@/modules/capability-execution/service-usage-evidence'

const originalDigest = (row: Doc<'capabilityServiceUsageRecords'>) => row.supportDigest ?? supportDigest({ state: 'completed', resultKind: 'completed', evidenceHash: row.sourceEvidenceHash ?? null })
async function revisions(ctx: Pick<QueryCtx, 'db'>, root: Doc<'capabilityServiceUsageRecords'>) {
  const rows = await ctx.db.query('capabilityServiceUsageRevisions').withIndex('by_usageRef_and_revision', q => q.eq('usageRef', root.usageRef)).take(51)
  if (rows.length > 50) throw new Error('measurement_lineage_too_large')
  if (rows.some(row => row.accountRef !== root.accountRef || row.callRef !== root.callRef)) throw new Error('measurement_lineage_identity_conflict')
  return rows.map(({ revisionRef, previousRevisionRef, revision, sourceDigest, support, quantityUnits, effectiveAt, observedAt }) => ({ revisionRef, previousRevisionRef, revision, sourceDigest, support, quantityUnits, effectiveAt, observedAt }))
}
export async function readMeasurementEvidence(ctx: Pick<QueryCtx, 'db'>, row: Doc<'capabilityServiceUsageRecords'>, asOfObservedAt: number, asOfEffectiveAt: number, call?: Doc<'capabilityCalls'>): Promise<ServiceUsageEvidence> {
  const history = await revisions(ctx, row)
  if (call !== undefined) {
    if (row.accountRef !== call.ownerId || row.callRef !== call.callRef || row.credentialRef !== call.credentialId || row.principalRef !== call.principalId
      || row.applicationRef !== call.applicationRef || row.toolRef !== call.toolRef) return { kind: 'unavailable', code: 'measurement_identity_conflict' }
    if (call.updatedAt <= asOfEffectiveAt && supportDigest(measurementSupport(call)) !== (history.at(-1)?.sourceDigest ?? originalDigest(row))) {
      return { kind: 'unavailable', code: 'measurement_canonical_support_changed' }
    }
  }
  return projectServiceUsageEvidence({ usageRef: row.usageRef, callRef: row.callRef, occurredAt: row.occurredAt, observedAt: row.observedAt,
    sourceDigest: originalDigest(row), revisions: history, asOfObservedAt, asOfEffectiveAt })
}

/** Private shared mutation helper: the canonical worker supplies the persisted
 * Call projection. There is no public quantity, reason or adjudicator input. */
export async function appendCanonicalSupport(ctx: MutationCtx, row: Doc<'capabilityServiceUsageRecords'>, support: MeasurementSupport, effectiveAt: number): Promise<string> {
  const history = await revisions(ctx, row)
  const observedAt = Date.now()
  projectServiceUsageEvidence({ usageRef: row.usageRef, callRef: row.callRef, occurredAt: row.occurredAt, observedAt: row.observedAt,
    sourceDigest: originalDigest(row), revisions: history, asOfObservedAt: observedAt, asOfEffectiveAt: observedAt })
  const digest = supportDigest(support), last = history.at(-1)
  if (digest === (last?.sourceDigest ?? originalDigest(row))) return last?.revisionRef ?? row.usageRef
  if (history.length >= 50 || !Number.isSafeInteger(effectiveAt) || effectiveAt < row.occurredAt || effectiveAt > observedAt
    || observedAt < (last?.observedAt ?? row.observedAt)) throw new Error('measurement_revision_invalid')
  const previousRevisionRef = last?.revisionRef ?? row.usageRef
  const revisionRef = `service-usage-revision:${canonicalDigest({ usageRef: row.usageRef, previousRevisionRef, sourceDigest: digest })}`
  await ctx.db.insert('capabilityServiceUsageRevisions', { usageRef: row.usageRef, accountRef: row.accountRef, callRef: row.callRef,
    revisionRef, previousRevisionRef, revision: history.length + 1, sourceDigest: digest, support,
    quantityUnits: supportedQuantity(support), effectiveAt, observedAt, source: 'canonical_call_support' })
  return revisionRef
}

export const canonicalMeasurementSupport = measurementSupport

export async function refreshExistingMeasurement(ctx: MutationCtx, call: Doc<'capabilityCalls'>): Promise<void> {
  const row = await ctx.db.query('capabilityServiceUsageRecords').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
  if (row === null) return
  if (row.accountRef !== call.ownerId || row.credentialRef !== call.credentialId || row.principalRef !== call.principalId
    || row.applicationRef !== call.applicationRef || row.toolRef !== call.toolRef) throw new Error('service_usage_identity_conflict')
  const support = measurementSupport(call)
  const revisionRef = await appendCanonicalSupport(ctx, row, support, call.updatedAt)
  const projection = await ctx.db.query('capabilityCallProjections').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
  if (projection !== null) {
    if (projection.accountRef !== row.accountRef) throw new Error('service_usage_identity_conflict')
    await ctx.db.patch(projection._id, { currentDeliveredRequestUnits: supportedQuantity(support), measurementRevisionRef: revisionRef, observedAt: Date.now() })
  }
}
