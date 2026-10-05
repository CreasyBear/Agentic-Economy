import { digestReference } from '@/modules/money/public'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { CallDispatchProjectionShape } from './contracts'
import { appendCanonicalSupport, canonicalMeasurementSupport } from '../serviceUsage/lineage'
import { supportDigest, supportedQuantity } from '@/modules/capability-execution/service-usage-evidence'

/** A delivered request is a measured Call, not customer usefulness or a new charge.
 * Write in the same transaction as its projection; retries/refunds retain one fact.
 * No public caller may supply quantities, Account attribution or financial amounts. */
export async function recordDeliveredRequest(
  ctx: MutationCtx,
  row: Doc<'capabilityCalls'>,
  projection: CallDispatchProjectionShape,
  providerRef: string,
  fallbackPriceDigest: string,
  terminalAt: number,
): Promise<{ serviceUsageRef: string; deliveredRequestUnits: string; currentDeliveredRequestUnits: '1' | null; measurementRevisionRef: string } | undefined> {
  const receipt = projection.result !== undefined && 'receipt' in projection.result ? projection.result.receipt : undefined
  const rawPriceDigest = receipt?.priceDigest ?? projection.usage?.priceDigest ?? fallbackPriceDigest
  const priceDigest = isCanonicalDigest(rawPriceDigest) ? rawPriceDigest : canonicalDigest({ unrecognizedPriceDigest: rawPriceDigest })
  const usageRef = `service-usage:${canonicalDigest({ callRef: row.callRef, unitDefinitionRef: 'delivered_request:v1' })}`
  const existing = await ctx.db.query('capabilityServiceUsageRecords')
    .withIndex('by_usageRef', (index) => index.eq('usageRef', usageRef)).unique()
  if (existing !== null) {
    if (existing.accountRef !== row.ownerId || existing.callRef !== row.callRef
      || existing.toolRef !== row.toolRef || existing.credentialRef !== row.credentialId
      || existing.quoteRef !== row.quoteRef || existing.principalRef !== row.principalId
      || existing.applicationRef !== row.applicationRef || existing.providerRef !== providerRef
      || existing.environment !== row.environment || existing.priceDigest !== priceDigest) {
      throw new Error('service_usage_identity_conflict')
    }
    if (existing.callDigest === undefined) await ctx.db.patch(existing._id, { callDigest: digestReference('call', row.callRef) })
    else if (existing.callDigest !== digestReference('call', row.callRef)) throw new Error('service_usage_identity_conflict')
    const support = canonicalMeasurementSupport(projection)
    const measurementRevisionRef = await appendCanonicalSupport(ctx, existing, support, terminalAt)
    return { serviceUsageRef: usageRef, deliveredRequestUnits: existing.quantityUnits, currentDeliveredRequestUnits: supportedQuantity(support), measurementRevisionRef }
  }
  if (projection.state !== 'completed' || projection.result?.kind !== 'completed' || supportedQuantity(canonicalMeasurementSupport(projection)) !== '1') return undefined
  const receiptAt = receipt === undefined ? Number.NaN : Date.parse(receipt.issuedAt)
  const receiptTimeAvailable = Number.isSafeInteger(receiptAt) && receiptAt >= row.createdAt && receiptAt <= Date.now()
  const sourceEvidenceHash = projection.evidenceHash ?? projection.result.evidenceHash
  await ctx.db.insert('capabilityServiceUsageRecords', {
    usageRef, callRef: row.callRef, callDigest: digestReference('call', row.callRef),
    ...(row.quoteRef === undefined ? {} : { quoteRef: row.quoteRef }),
    accountRef: row.ownerId, principalRef: row.principalId, credentialRef: row.credentialId,
    applicationRef: row.applicationRef, toolRef: row.toolRef, providerRef,
    environment: row.environment,
    unitDefinitionRef: 'delivered_request:v1', quantityUnits: '1', quantityExponent: 0,
    source: 'validated_call_result', priceDigest,
    supportDigest: supportDigest(canonicalMeasurementSupport(projection)),
    ...(sourceEvidenceHash === undefined || !isCanonicalDigest(sourceEvidenceHash) ? {} : { sourceEvidenceHash }),
    ...(receipt?.receiptRef === undefined || !/^receipt:sha256:[a-f0-9]{64}$/u.test(receipt.receiptRef) ? {} : { receiptRef: receipt.receiptRef }),
    timeBasis: receiptTimeAvailable ? 'receipt_issued' : 'call_updated',
    callCreatedAt: row.createdAt, occurredAt: receiptTimeAvailable ? receiptAt : terminalAt,
    observedAt: Date.now(),
  })
  return { serviceUsageRef: usageRef, deliveredRequestUnits: '1', currentDeliveredRequestUnits: '1', measurementRevisionRef: usageRef }
}
