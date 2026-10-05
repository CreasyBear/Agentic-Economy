import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { providerUnitMaterial, observationRef, providerUnitObservationSchema, verifiedProviderObservation, validProviderObservation,
  type ProviderUnitCallSource, type ProviderUnitEvidence, type ProviderUnitObservation } from '@/modules/capability-execution/provider-service-units'

/** A child fact of the existing measurement root, never a charge or ledger event.
 * Only canonical completed Calls with a durable attempt can produce observations. */
export async function captureProviderUnits(ctx: MutationCtx, call: Doc<'capabilityCalls'>, root: Doc<'capabilityServiceUsageRecords'>): Promise<ProviderUnitObservation | undefined> {
  const operation = call.toolJson === undefined ? undefined : parsePublishedToolSnapshot(call.toolJson)
  if (operation === undefined || call.attemptRef === undefined) return undefined
  const attempt = await ctx.db.query('actionExecutionAttempts').withIndex('by_executionRef_and_attemptRef', q => q.eq('executionRef', call.callRef).eq('attemptRef', call.attemptRef as string)).unique()
  if (attempt === null || attempt.actor.principalRef !== call.principalId || attempt.release.state !== 'released'
    || (attempt.outcome.state !== 'returned' && attempt.outcome.state !== 'reconciled_released')) return undefined
  const material = providerUnitMaterial(call as ProviderUnitCallSource, operation, { attemptRef: attempt.attemptRef,
    attemptNumber: attempt.attemptNumber, effectGeneration: attempt.effectGeneration, operationKeyDigest: canonicalDigest(attempt.idempotency.operationKey) })
  if (material === null) return undefined
  const rows = await ctx.db.query('capabilityServiceUnitObservations').withIndex('by_callRef_and_sequence', q => q.eq('callRef', call.callRef)).take(51)
  if (rows.length > 50) return undefined
  if (rows.some(row => !sameIdentity(row, call) || !validProviderObservation(stripDocument(row)))) throw new Error('provider_unit_identity_conflict')
  const latest = rows.at(-1), previousAttempt = [...rows].reverse().find(row => row.attemptRef === attempt.attemptRef && row.effectGeneration === attempt.effectGeneration)
  if (latest?.sourceDigest === material.sourceDigest) return stripDocument(latest)
  // Finite audit history. No units from a missed capture are silently backfilled.
  if (rows.length === 50) return undefined
  const previousObservationRef = latest?.observationRef ?? null, previousAttemptObservationRef = previousAttempt?.observationRef ?? null, sequence = rows.length + 1
  const observation = providerUnitObservationSchema.parse({ ...material, previousObservationRef, previousAttemptObservationRef, sequence,
    observationRef: observationRef({ sourceDigest: material.sourceDigest, previousObservationRef, previousAttemptObservationRef, sequence }),
    change: previousAttempt === undefined ? 'initial_attempt' : 'support_correction', occurredAt: previousAttempt?.occurredAt ?? call.updatedAt,
    effectiveAt: call.updatedAt, observedAt: Date.now(), timeBasis: 'call_updated' })
  await ctx.db.insert('capabilityServiceUnitObservations', observation)
  await ctx.db.patch(root._id, { providerUnitHeadRef: observation.observationRef })
  return observation
}
function stripDocument(row: Doc<'capabilityServiceUnitObservations'>) { const { _id, _creationTime, ...observation } = row; return observation }
function sameIdentity(row: ProviderUnitObservation, call: Doc<'capabilityCalls'>) {
  return row.callRef === call.callRef && row.accountRef === call.ownerId && row.principalRef === call.principalId && row.credentialRef === call.credentialId
    && row.applicationRef === call.applicationRef && row.toolRef === call.toolRef && row.environment === call.environment
}
export async function readProviderUnitEvidence(ctx: Pick<QueryCtx, 'db'>, call: Doc<'capabilityCalls'>, observedThrough: number, effectiveThrough: number): Promise<ProviderUnitEvidence> {
  const rows = await ctx.db.query('capabilityServiceUnitObservations').withIndex('by_callRef_and_sequence', q => q.eq('callRef', call.callRef)).take(51)
  const root = await ctx.db.query('capabilityServiceUsageRecords').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
  let valid = rows.length <= 50, previous: string | null = null, lastObserved = 0
  const attempts = new Map<string, string>(), observations: ProviderUnitObservation[] = []
  for (const [index, row] of rows.entries()) {
    const parsed = providerUnitObservationSchema.safeParse(stripDocument(row)), key = `${row.attemptRef}:${row.effectGeneration}`
    if (!parsed.success || !validProviderObservation(parsed.data) || !sameIdentity(row, call) || row.sequence !== index + 1 || row.previousObservationRef !== previous
      || row.previousAttemptObservationRef !== (attempts.get(key) ?? null) || row.observedAt < lastObserved
      || row.observationRef !== observationRef({ sourceDigest: row.sourceDigest, previousObservationRef: row.previousObservationRef, previousAttemptObservationRef: row.previousAttemptObservationRef, sequence: row.sequence })) {valid = false; break}
    previous = row.observationRef; lastObserved = row.observedAt; attempts.set(key, row.observationRef)
    if (row.observedAt <= observedThrough && row.effectiveAt <= effectiveThrough) observations.push(parsed.data)
  }
  const operation = call.toolJson === undefined ? undefined : parsePublishedToolSnapshot(call.toolJson)
  const last = observations.at(-1)
  const current = valid && call.updatedAt <= effectiveThrough && root !== null
    && root.accountRef === call.ownerId && root.principalRef === call.principalId && root.credentialRef === call.credentialId
    && root.applicationRef === call.applicationRef && root.toolRef === call.toolRef && root.providerRef === operation?.identity.businessId
    ? verifiedProviderObservation(call as ProviderUnitCallSource, operation, last, root.providerUnitHeadRef) : null
  const material = { source: 'provider_reported_completed_call' as const, authoritativeForMoney: false as const,
    current, currentSupport: current === null ? 'unknown' as const : 'verified' as const, observations: valid ? observations : [], coverage: 'successful_call_receipts_only' as const }
  return { ...material, evidenceDigest: canonicalDigest({ format: 'ae.provider-unit-evidence:v1', ...material }) }
}
