import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  actionInvocationOriginValue,
  attemptTransitionValue,
  attemptReleaseValue,
  authorityBindingValue,
  durableControlProjectionValue,
  durableAttemptOutcomeValue,
  invocationActorValue,
  invocationControlValue,
  invocationFreshnessValue,
} from '../src/modules/action-invocation/public'

const controlRow = v.object({
  invocationRef: v.string(), invocationVersion: v.number(), sourceRef: v.string(),
  sourceResultRef: v.optional(v.string()), sourceResultDigest: v.optional(v.string()),
  terminalBusinessOutcome: v.optional(v.string()),
  terminalResultReferenceable: v.optional(v.boolean()),
  control: durableControlProjectionValue,
  authorityBinding: v.optional(authorityBindingValue),
  preparedMaterialDigest: v.optional(v.string()), preparedTargetDigest: v.optional(v.string()),
  consequence: v.optional(v.string()), dataLimitSummary: v.optional(v.record(v.string(), v.number())),
  authorityDecisionAt: v.optional(v.string()), currentAttemptRef: v.optional(v.string()),
  currentEffectGeneration: v.optional(v.number()), currentLeaseOwner: v.optional(v.string()),
  currentLeaseExpiresAt: v.optional(v.string()), updatedAt: v.string(),
})
const attemptRow = v.object({
  invocationRef: v.string(), attemptRef: v.string(), attemptNumber: v.number(),
  effectGeneration: v.number(), actor: invocationActorValue,
  idempotency: v.object({
    operationKey: v.string(), materialInputDigest: v.string(), effectIdentity: v.string(),
  }),
  lease: v.object({ owner: v.string(), expiresAt: v.string() }),
  release: attemptReleaseValue, outcome: durableAttemptOutcomeValue,
  recordedAt: v.string(),
})
const historyInput = v.object({
  invocationRef: v.string(), commandId: v.string(), commandDigest: v.string(),
  commandResult: v.union(v.literal('applied'), v.literal('duplicate')), kind: v.string(),
  effectGeneration: v.optional(v.number()), actorRef: v.optional(v.string()),
  sourceEvidenceRef: v.optional(v.string()),
  observation: v.optional(v.object({
    kind: v.literal('release_observation'),
    release: v.union(v.literal('not_released'), v.literal('released'), v.literal('possibly_released')),
    evidenceDigest: v.string(),
  })),
  attemptTransition: v.optional(attemptTransitionValue),
})

/**
 * Private transport wrappers for Action Invocation control persistence. The
 * module contract stays under src/modules/action-invocation; no public endpoint
 * is created here.
 */
export const transact = internalMutation({
  args: {
    commandId: v.string(),
    commandDigest: v.string(),
    expectedInvocationVersion: v.union(v.number(), v.null()),
    expectedEffectGeneration: v.optional(v.number()),
    row: controlRow,
    currentAttemptWrite: v.optional(attemptRow),
    history: historyInput,
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query('actionInvocationHistory')
      .withIndex('by_invocationRef_and_commandId', (q) =>
        q.eq('invocationRef', args.row.invocationRef).eq('commandId', args.commandId))
      .unique()
    if (duplicate !== null && duplicate.commandDigest !== args.commandDigest) {
      return { kind: 'refused' as const, code: 'command_identity_conflict' as const }
    }
    if (duplicate !== null) {
      return { kind: 'duplicate' as const, invocationVersion: duplicate.invocationVersion }
    }
    const current = await ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.row.invocationRef))
      .unique()
    if ((current?.invocationVersion ?? null) !== args.expectedInvocationVersion) {
      return { kind: 'refused' as const, code: 'stale_invocation_version' as const }
    }
    if (current !== null && args.row.invocationVersion <= current.invocationVersion) {
      return { kind: 'refused' as const, code: 'stale_invocation_version' as const }
    }
    if (
      args.expectedEffectGeneration !== undefined &&
      current?.currentEffectGeneration !== args.expectedEffectGeneration
    ) return { kind: 'refused' as const, code: 'effect_generation_stale' as const }

    const attemptWrite = args.currentAttemptWrite
    const existingAttempt = attemptWrite === undefined
      ? null
      : await ctx.db.query('actionInvocationAttempts')
        .withIndex('by_invocationRef_and_attemptRef', (q) =>
          q.eq('invocationRef', attemptWrite.invocationRef).eq('attemptRef', attemptWrite.attemptRef))
        .unique()
    if (
      attemptWrite !== undefined &&
      (
        attemptWrite.invocationRef !== args.row.invocationRef ||
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
    if (current === null) await ctx.db.insert('actionInvocationControls', args.row)
    else await ctx.db.replace(current._id, args.row)
    if (attemptWrite !== undefined && existingAttempt === null) {
      await ctx.db.insert('actionInvocationAttempts', attemptWrite)
    } else if (attemptWrite !== undefined && existingAttempt !== null) {
      await ctx.db.replace(existingAttempt._id, attemptWrite)
    }
    await ctx.db.insert('actionInvocationHistory', {
      ...args.history,
      commandId: args.commandId,
      commandDigest: args.commandDigest,
      commandResult: 'applied',
      invocationVersion: args.row.invocationVersion,
      current: true,
      recordedAt: args.row.updatedAt,
    })
    return { kind: 'applied' as const, invocationVersion: args.row.invocationVersion }
  },
})

export const readControl = internalQuery({
  args: { invocationRef: v.string() },
  handler: (ctx, args) => ctx.db.query('actionInvocationControls')
    .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
    .unique(),
})

export const recordLateObservation = internalMutation({
  args: {
    invocationRef: v.string(), commandId: v.string(),
    effectGeneration: v.number(), actorRef: v.string(), sourceEvidenceRef: v.string(),
    release: v.union(v.literal('not_released'), v.literal('released'), v.literal('possibly_released')),
    evidenceDigest: v.string(), recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const commandDigest = canonicalDigest({
      invocationRef: args.invocationRef, effectGeneration: args.effectGeneration,
      actorRef: args.actorRef, sourceEvidenceRef: args.sourceEvidenceRef,
      release: args.release, evidenceDigest: args.evidenceDigest,
    })
    const current = await ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
      .unique()
    if (current === null) return { kind: 'refused' as const, code: 'stale_invocation_version' as const }
    const prior = await ctx.db.query('actionInvocationHistory')
      .withIndex('by_invocationRef_and_commandId', (q) =>
        q.eq('invocationRef', args.invocationRef).eq('commandId', args.commandId))
      .unique()
    if (prior !== null && prior.commandDigest !== commandDigest) {
      return { kind: 'refused' as const, code: 'command_identity_conflict' as const }
    }
    if (prior !== null) return { kind: 'duplicate' as const, invocationVersion: prior.invocationVersion }
    await ctx.db.insert('actionInvocationHistory', {
      invocationRef: args.invocationRef, commandId: args.commandId,
      commandDigest, commandResult: 'applied',
      invocationVersion: current.invocationVersion, effectGeneration: args.effectGeneration,
      kind: 'late_observation', current: false, actorRef: args.actorRef,
      sourceEvidenceRef: args.sourceEvidenceRef,
      observation: {
        kind: 'release_observation', release: args.release, evidenceDigest: args.evidenceDigest,
      },
      recordedAt: args.recordedAt,
    })
    return { kind: 'applied' as const, invocationVersion: current.invocationVersion }
  },
})

export const readAttempts = internalQuery({
  args: { invocationRef: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, args) => ctx.db.query('actionInvocationAttempts')
    .withIndex('by_invocationRef_and_attemptNumber', (q) =>
      q.eq('invocationRef', args.invocationRef))
    .paginate(args.paginationOpts),
})

export const readAttempt = internalQuery({
  args: { invocationRef: v.string(), attemptRef: v.string() },
  handler: (ctx, args) => ctx.db.query('actionInvocationAttempts')
    .withIndex('by_invocationRef_and_attemptRef', (q) =>
      q.eq('invocationRef', args.invocationRef).eq('attemptRef', args.attemptRef))
    .unique(),
})

export const readHistory = internalQuery({
  args: { invocationRef: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, args) => ctx.db.query('actionInvocationHistory')
    .withIndex('by_invocationRef_and_invocationVersion', (q) =>
      q.eq('invocationRef', args.invocationRef))
    .paginate(args.paginationOpts),
})

export const readHistoryCommand = internalQuery({
  args: { invocationRef: v.string(), commandId: v.string() },
  handler: (ctx, args) => ctx.db.query('actionInvocationHistory')
    .withIndex('by_invocationRef_and_commandId', (q) =>
      q.eq('invocationRef', args.invocationRef).eq('commandId', args.commandId))
    .unique(),
})
