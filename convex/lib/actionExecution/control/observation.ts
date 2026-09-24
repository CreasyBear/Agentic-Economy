import type { Infer, ObjectType } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { lateObservationArgs, persistControlResult } from './contracts'

export async function recordLateObservationHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof lateObservationArgs>,
): Promise<Infer<typeof persistControlResult>> {
  const commandDigest = canonicalDigest({
    invocationRef: args.executionRef, effectGeneration: args.effectGeneration,
    actorRef: args.actorRef, sourceEvidenceRef: args.sourceEvidenceRef,
    release: args.release, evidenceDigest: args.evidenceDigest,
  })
  const current = await ctx.db.query('actionExecutionControls')
    .withIndex('by_executionRef', (q) => q.eq('executionRef', args.executionRef))
    .unique()
  if (current === null) return { kind: 'refused' as const, code: 'stale_execution_version' as const }
  const prior = await ctx.db.query('actionExecutionHistory')
    .withIndex('by_executionRef_and_commandId', (q) =>
      q.eq('executionRef', args.executionRef).eq('commandId', args.commandId))
    .unique()
  if (prior !== null && prior.commandDigest !== commandDigest) {
    return { kind: 'refused' as const, code: 'command_identity_conflict' as const }
  }
  if (prior !== null) return { kind: 'duplicate' as const, executionVersion: prior.executionVersion }
  await ctx.db.insert('actionExecutionHistory', {
    executionRef: args.executionRef, commandId: args.commandId,
    commandDigest, commandResult: 'applied',
    executionVersion: current.executionVersion, effectGeneration: args.effectGeneration,
    kind: 'late_observation', current: false, actorRef: args.actorRef,
    sourceEvidenceRef: args.sourceEvidenceRef,
    observation: {
      kind: 'release_observation', release: args.release, evidenceDigest: args.evidenceDigest,
    },
    recordedAt: args.recordedAt,
  })
  return { kind: 'applied' as const, executionVersion: current.executionVersion }
}
