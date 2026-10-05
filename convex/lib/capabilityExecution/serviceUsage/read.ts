import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { readMeasurementEvidence } from './lineage'
import type { ServiceUsageEvidence } from '@/modules/capability-execution/service-usage-evidence'

export async function readOwnerEvidenceHandler(ctx: QueryCtx, args: { callRef: string; asOfObservedAt: number; asOfEffectiveAt: number }): Promise<ServiceUsageEvidence> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'owner_required' }
  if (args.callRef.length > 300 || ![args.asOfObservedAt,args.asOfEffectiveAt].every(time => Number.isSafeInteger(time) && time >= 0)) return { kind: 'refused', code: 'measurement_period_invalid' }
  const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
  if (call?.ownerId !== actor.canonicalAccountRef) return { kind: 'refused', code: 'invocation_not_found' }
  const usage = await ctx.db.query('capabilityServiceUsageRecords').withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
  if (usage === null) return { kind: 'not_recorded' }
  if (usage.accountRef !== actor.canonicalAccountRef || usage.credentialRef !== call.credentialId || usage.principalRef !== call.principalId) return { kind: 'unavailable', code: 'measurement_identity_conflict' }
  return await readMeasurementEvidence(ctx, usage, args.asOfObservedAt, args.asOfEffectiveAt, call)
}
