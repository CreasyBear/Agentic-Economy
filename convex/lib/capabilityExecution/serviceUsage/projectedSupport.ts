import type { QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { measurementSupport, supportDigest, supportedQuantity, measurementSupportSchema } from '@/modules/capability-execution/service-usage-evidence'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { verifiedProviderObservation, type ProviderUnitCallSource } from '@/modules/capability-execution/provider-service-units'
type Projection = Pick<Doc<'capabilityCallProjections'>, 'callRef' | 'accountRef' | 'principalRef' | 'credentialRef' | 'applicationRef' | 'toolRef' | 'serviceUsageRef' | 'currentDeliveredRequestUnits' | 'measurementRevisionRef' | 'providerUnitObservation'>
function providerSourceDigest(call: Doc<'capabilityCalls'>): string | null {
  const result = call.result
  if (result?.kind !== 'completed') return null
  // Preserve the existing fingerprint for unexpired and older records. After
  // authorised cleanup, fingerprint durable provenance, never deleted content.
  // This digest detects source changes; it does not verify provider quantities.
  return 'output' in result
    ? canonicalDigest({ outputDigest: canonicalDigest(result.output), attemptRef: call.attemptRef ?? null, requestDigest: call.requestDigest, toolJson: call.toolJson ?? null, inputJson: call.inputJson ?? null })
    : canonicalDigest({ format: 'ae.provider-source-expired:v1', contentExpiredAt: result.contentExpiredAt,
        callContentExpiredAt: call.contentExpiredAt ?? null, evidenceHash: result.evidenceHash,
        attemptRef: call.attemptRef ?? null, requestDigest: call.requestDigest, inputDigest: call.inputDigest, toolRef: call.toolRef })
}
/** Bounded current-head check for summaries/exports. Full lineage validation
 * remains in the receipt and frozen draft. No projection alone proves freshness. */
export async function readProjectedSupport(ctx: Pick<QueryCtx, 'db'>, row: Projection) {
  const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', row.callRef)).unique()
  const root = await ctx.db.query('capabilityServiceUsageRecords').withIndex('by_callRef', q => q.eq('callRef', row.callRef)).unique()
  const head = root === null ? null : await ctx.db.query('capabilityServiceUsageRevisions').withIndex('by_usageRef_and_revision', q => q.eq('usageRef', root.usageRef)).order('desc').first()
  const support = call === null ? null : measurementSupport(call)
  const sourceDigest = support === null ? null : supportDigest(support)
  const headSupport = head === null ? null : measurementSupportSchema.safeParse(head.support)
  const expectedRef = head?.revisionRef ?? root?.usageRef
  const observedDigest = head?.sourceDigest ?? (root === null ? null : root.supportDigest ?? supportDigest({state: 'completed', resultKind: 'completed', evidenceHash: root.sourceEvidenceHash ?? null}))
  const quantity = support === null ? null : supportedQuantity(support)
  const headValid = head === null || (headSupport?.success === true && head.accountRef === root?.accountRef && head.callRef === root?.callRef
    && head.sourceDigest === supportDigest(headSupport.data) && head.quantityUnits === supportedQuantity(headSupport.data)
    && head.revisionRef === `service-usage-revision:${canonicalDigest({usageRef: head.usageRef, previousRevisionRef: head.previousRevisionRef, sourceDigest: head.sourceDigest})}`)
  const verified = root !== null && call !== null && headValid && sourceDigest === observedDigest
    && root.usageRef === row.serviceUsageRef && root.accountRef === row.accountRef && call.ownerId === row.accountRef
    && root.credentialRef === row.credentialRef && call.credentialId === row.credentialRef && root.principalRef === row.principalRef && call.principalId === row.principalRef
    && root.applicationRef === row.applicationRef && call.applicationRef === row.applicationRef && root.toolRef === row.toolRef && call.toolRef === row.toolRef
    && row.currentDeliveredRequestUnits === quantity && row.measurementRevisionRef === expectedRef
  const providerUnitObservation = verified && call !== null ? verifiedProviderObservation(call as ProviderUnitCallSource,
    call.toolJson === undefined ? undefined : parsePublishedToolSnapshot(call.toolJson), row.providerUnitObservation, root?.providerUnitHeadRef) : null
  const fingerprint = canonicalDigest({verified, quantityUnits: verified ? quantity : null, call: call === null ? null : {accountRef: call.ownerId, credentialRef: call.credentialId, principalRef: call.principalId,
    applicationRef: call.applicationRef, toolRef: call.toolRef, createdAt: call.createdAt, updatedAt: call.updatedAt, supportDigest: sourceDigest,
    providerSource: providerSourceDigest(call)},
    root: root === null ? null : {usageRef: root.usageRef, accountRef: root.accountRef, callRef: root.callRef, credentialRef: root.credentialRef, principalRef: root.principalRef, applicationRef: root.applicationRef, toolRef: root.toolRef, supportDigest: root.supportDigest ?? null, providerUnitHeadRef: root.providerUnitHeadRef ?? null},
    head: head === null ? null : {revisionRef: head.revisionRef, accountRef: head.accountRef, callRef: head.callRef, sourceDigest: head.sourceDigest, observedAt: head.observedAt}})
  return { verified, quantityUnits: verified ? quantity : null, fingerprint, providerUnitObservation }
}
