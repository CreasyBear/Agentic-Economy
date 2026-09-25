import type { Infer, ObjectType } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { actionExecutionTransactArgs, persistControlResult } from './contracts'

export async function transactHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof actionExecutionTransactArgs>,
): Promise<Infer<typeof persistControlResult>> {
  const duplicate = await ctx.db.query('actionExecutionHistory')
    .withIndex('by_executionRef_and_commandId', (q) =>
      q.eq('executionRef', args.row.executionRef).eq('commandId', args.commandId))
    .unique()
  if (duplicate !== null && duplicate.commandDigest !== args.commandDigest) {
    return { kind: 'refused' as const, code: 'command_identity_conflict' as const }
  }
  if (duplicate !== null) {
    return { kind: 'duplicate' as const, executionVersion: duplicate.executionVersion }
  }
  const current = await ctx.db.query('actionExecutionControls')
    .withIndex('by_executionRef', (q) => q.eq('executionRef', args.row.executionRef))
    .unique()
  if ((current?.executionVersion ?? null) !== args.expectedExecutionVersion) {
    return { kind: 'refused' as const, code: 'stale_execution_version' as const }
  }
  if (current !== null && args.row.executionVersion <= current.executionVersion) {
    return { kind: 'refused' as const, code: 'stale_execution_version' as const }
  }
  if (
    args.expectedEffectGeneration !== undefined &&
    current?.currentEffectGeneration !== args.expectedEffectGeneration
  ) return { kind: 'refused' as const, code: 'effect_generation_stale' as const }

  const attemptWrite = args.currentAttemptWrite
  const existingAttempt = attemptWrite === undefined
    ? null
    : await ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptRef', (q) =>
        q.eq('executionRef', attemptWrite.executionRef).eq('attemptRef', attemptWrite.attemptRef))
      .unique()
  if (
    attemptWrite !== undefined &&
    (
      attemptWrite.executionRef !== args.row.executionRef ||
      (
        existingAttempt !== null &&
        canonicalDigest({
          attemptNumber: existingAttempt.attemptNumber,
          actor: existingAttempt.actor,
          effectGeneration: existingAttempt.effectGeneration,
          idempotency: existingAttempt.idempotency,
          lease: existingAttempt.lease,
        }) !== canonicalDigest({
          attemptNumber: attemptWrite.attemptNumber,
          actor: attemptWrite.actor,
          effectGeneration: attemptWrite.effectGeneration,
          idempotency: attemptWrite.idempotency,
          lease: attemptWrite.lease,
        })
      )
    )
  ) {
    return { kind: 'refused' as const, code: 'command_identity_conflict' as const }
  }
  if (current === null) await ctx.db.insert('actionExecutionControls', args.row)
  else await ctx.db.replace(current._id, args.row)
  if (attemptWrite !== undefined && existingAttempt === null) {
    await ctx.db.insert('actionExecutionAttempts', attemptWrite)
  } else if (attemptWrite !== undefined && existingAttempt !== null) {
    await ctx.db.replace(existingAttempt._id, attemptWrite)
  }
  await ctx.db.insert('actionExecutionHistory', {
    ...args.history,
    commandId: args.commandId,
    commandDigest: args.commandDigest,
    commandResult: 'applied',
    executionVersion: args.row.executionVersion,
    current: true,
    recordedAt: args.row.updatedAt,
  })
  return { kind: 'applied' as const, executionVersion: args.row.executionVersion }
}
