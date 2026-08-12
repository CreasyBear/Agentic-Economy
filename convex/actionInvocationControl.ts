import { ConvexError, v, type Infer, type ObjectType } from 'convex/values'
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  requireSourceWrite,
  sourceWriteArgs,
} from './sourceWriteAdmission'
import {
  sourceWriteCommandDigest,
  verifySourceWriteAdmission,
  type SourceWriteAdmission,
} from '../src/modules/security/source-write-admission'
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

const exactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const invocationLimitsValue = v.record(v.string(), v.union(v.number(), exactAmountValue))

const controlRow = v.object({
  invocationRef: v.string(), invocationVersion: v.number(), sourceRef: v.string(),
  sourceResultRef: v.optional(v.string()), sourceResultDigest: v.optional(v.string()),
  terminalBusinessOutcome: v.optional(v.string()),
  terminalResultReferenceable: v.optional(v.boolean()),
  control: durableControlProjectionValue,
  authorityBinding: v.optional(authorityBindingValue),
  preparedMaterialDigest: v.optional(v.string()), preparedTargetDigest: v.optional(v.string()),
  consequence: v.optional(v.string()), dataLimitSummary: v.optional(invocationLimitsValue),
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
const historyFields = {
  invocationRef: v.string(),
  commandId: v.string(),
  commandDigest: v.string(),
  commandResult: v.union(v.literal('applied'), v.literal('duplicate')),
  kind: v.string(),
  effectGeneration: v.optional(v.number()),
  actorRef: v.optional(v.string()),
  sourceEvidenceRef: v.optional(v.string()),
  observation: v.optional(v.object({
    kind: v.literal('release_observation'),
    release: v.union(v.literal('not_released'), v.literal('released'), v.literal('possibly_released')),
    evidenceDigest: v.string(),
  })),
  attemptTransition: v.optional(attemptTransitionValue),
}
const historyInput = v.object(historyFields)
const historyRow = v.object({
  ...historyFields,
  invocationVersion: v.number(),
  current: v.boolean(),
  recordedAt: v.string(),
})
const persistControlResult = v.union(
  v.object({
    kind: v.union(v.literal('applied'), v.literal('duplicate')),
    invocationVersion: v.number(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('stale_invocation_version'),
      v.literal('effect_generation_stale'),
      v.literal('lease_not_current'),
      v.literal('command_identity_conflict'),
      v.literal('reconciliation_required'),
    ),
  }),
)
export const actionInvocationTransactArgs = {
  commandId: v.string(),
  commandDigest: v.string(),
  expectedInvocationVersion: v.union(v.number(), v.null()),
  expectedEffectGeneration: v.optional(v.number()),
  row: controlRow,
  currentAttemptWrite: v.optional(attemptRow),
  history: historyInput,
} as const
const lateObservationArgs = {
  invocationRef: v.string(),
  commandId: v.string(),
  effectGeneration: v.number(),
  actorRef: v.string(),
  sourceEvidenceRef: v.string(),
  release: v.union(v.literal('not_released'), v.literal('released'), v.literal('possibly_released')),
  evidenceDigest: v.string(),
  recordedAt: v.string(),
}
type TransactArgs = ObjectType<typeof actionInvocationTransactArgs>
type LateObservationArgs = ObjectType<typeof lateObservationArgs>
async function transactHandler(ctx: MutationCtx, args: TransactArgs): Promise<Infer<typeof persistControlResult>> {
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
}

export const transact = internalMutation({
  args: actionInvocationTransactArgs,
  returns: persistControlResult,
  handler: transactHandler,
})

const invocationRefArgs = { invocationRef: v.string() }
const readAttemptsArgs = { invocationRef: v.string(), limit: v.number() }
const readAttemptArgs = { invocationRef: v.string(), attemptRef: v.string() }
const readHistoryArgs = { invocationRef: v.string(), afterVersion: v.number(), limit: v.number() }
const readHistoryCommandArgs = { invocationRef: v.string(), commandId: v.string() }
const ownerReadArgs = {
  invocationRef: v.string(),
  callerRef: v.string(),
  principalRef: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}
const transactSourceArgs = {
  ...actionInvocationTransactArgs,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}
const lateObservationSourceArgs = {
  ...lateObservationArgs,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}
const readAttemptsSourceArgs = { ...ownerReadArgs, limit: v.number() }
const readAttemptSourceArgs = { ...ownerReadArgs, attemptRef: v.string() }
const readHistorySourceArgs = { ...ownerReadArgs, afterVersion: v.number(), limit: v.number() }
const readHistoryCommandSourceArgs = { ...ownerReadArgs, commandId: v.string() }
type OwnerReadArgs = ObjectType<typeof ownerReadArgs>

function withoutSystemFields<Row extends { _id: string; _creationTime: number }>(
  row: Row,
): Omit<Row, '_id' | '_creationTime'> {
  const { _id, _creationTime, ...value } = row
  return value
}

function readLimit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), 1_000) : 0
}

async function readControlHandler(ctx: QueryCtx, args: ObjectType<typeof invocationRefArgs>) {
  const row = await ctx.db.query('actionInvocationControls')
    .withIndex('by_invocationRef', (q) => q.eq('invocationRef', args.invocationRef))
    .unique()
  return row === null ? null : withoutSystemFields(row)
}

async function readOwnedControl(
  ctx: QueryCtx,
  args: Pick<OwnerReadArgs, 'invocationRef' | 'callerRef' | 'principalRef'>,
) {
  const row = await ctx.db.query('actionInvocationControls')
    .withIndex('by_control_owner_principalRef_and_invocationRef', (q) => (
      q.eq('control.owner.principalRef', args.principalRef).eq('invocationRef', args.invocationRef)
    ))
    .unique()
  return row === null || row.control.owner.callerRef !== args.callerRef ? null : row
}

async function readAttemptsHandler(ctx: QueryCtx, args: ObjectType<typeof readAttemptsArgs>) {
  const rows = await ctx.db.query('actionInvocationAttempts')
    .withIndex('by_invocationRef_and_attemptNumber', (q) => q.eq('invocationRef', args.invocationRef))
    .order('asc')
    .take(readLimit(args.limit))
  return rows.map(withoutSystemFields)
}

async function readAttemptHandler(ctx: QueryCtx, args: ObjectType<typeof readAttemptArgs>) {
  const row = await ctx.db.query('actionInvocationAttempts')
    .withIndex('by_invocationRef_and_attemptRef', (q) =>
      q.eq('invocationRef', args.invocationRef).eq('attemptRef', args.attemptRef))
    .unique()
  return row === null ? null : withoutSystemFields(row)
}

async function readHistoryHandler(ctx: QueryCtx, args: ObjectType<typeof readHistoryArgs>) {
  const rows = await ctx.db.query('actionInvocationHistory')
    .withIndex('by_invocationRef_and_invocationVersion', (q) =>
      q.eq('invocationRef', args.invocationRef).gt('invocationVersion', args.afterVersion))
    .order('asc')
    .take(readLimit(args.limit))
  return rows.map(withoutSystemFields)
}

async function readHistoryCommandHandler(ctx: QueryCtx, args: ObjectType<typeof readHistoryCommandArgs>) {
  const row = await ctx.db.query('actionInvocationHistory')
    .withIndex('by_invocationRef_and_commandId', (q) =>
      q.eq('invocationRef', args.invocationRef).eq('commandId', args.commandId))
    .unique()
  return row === null ? null : withoutSystemFields(row)
}

async function recordLateObservationHandler(
  ctx: MutationCtx,
  args: LateObservationArgs,
): Promise<Infer<typeof persistControlResult>> {
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
}

async function requireActionInvocationSourceWrite(
  ctx: { db: unknown },
  args: {
    operationKey: string
    correlationId: string
    sourceWrite?: unknown
    sourceWriteRequest?: unknown
  },
): Promise<void> {
  const result = await requireSourceWrite(ctx, args, 'protected_action')
  if (result.kind === 'rejected') {
    throw new Error(`action_invocation_source_write_rejected:${result.reason}`)
  }
}

async function requireActionInvocationSourceRead(args: OwnerReadArgs): Promise<void> {
  const admission = args.sourceWrite as SourceWriteAdmission | undefined
  if (args.sourceWriteRequest === undefined) {
    throw new ConvexError({
      code: 'action_invocation_source_read_rejected',
      reason: 'missing_source_write_request',
    })
  }
  const verification = await verifySourceWriteAdmission({
    ...(admission === undefined ? {} : { admission }),
    expected: {
      scope: 'protected_action',
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      commandDigest: sourceWriteCommandDigest(args),
      request: args.sourceWriteRequest,
    },
  })
  if (verification.kind === 'rejected') {
    throw new ConvexError({
      code: 'action_invocation_source_read_rejected',
      reason: verification.reason,
    })
  }
}

export const readControl = internalQuery({
  args: invocationRefArgs,
  returns: v.union(controlRow, v.null()),
  handler: readControlHandler,
})

export const recordLateObservation = internalMutation({
  args: lateObservationArgs,
  returns: persistControlResult,
  handler: recordLateObservationHandler,
})

export const readAttempts = internalQuery({
  args: readAttemptsArgs,
  returns: v.array(attemptRow),
  handler: readAttemptsHandler,
})

export const readAttempt = internalQuery({
  args: readAttemptArgs,
  returns: v.union(attemptRow, v.null()),
  handler: readAttemptHandler,
})

export const readHistory = internalQuery({
  args: readHistoryArgs,
  returns: v.array(historyRow),
  handler: readHistoryHandler,
})

export const readHistoryCommand = internalQuery({
  args: readHistoryCommandArgs,
  returns: v.union(historyRow, v.null()),
  handler: readHistoryCommandHandler,
})

export const transactSource = mutation({
  args: transactSourceArgs,
  returns: persistControlResult,
  handler: async (ctx, args) => {
    await requireActionInvocationSourceWrite(ctx, args)
    return transactHandler(ctx, args)
  },
})

export const recordLateObservationSource = mutation({
  args: lateObservationSourceArgs,
  returns: persistControlResult,
  handler: async (ctx, args) => {
    await requireActionInvocationSourceWrite(ctx, args)
    return recordLateObservationHandler(ctx, args)
  },
})

export const readControlSource = query({
  args: ownerReadArgs,
  returns: v.union(controlRow, v.null()),
  handler: async (ctx, args) => {
    await requireActionInvocationSourceRead(args)
    const row = await readOwnedControl(ctx, args)
    return row === null ? null : withoutSystemFields(row)
  },
})

export const readAttemptsSource = query({
  args: readAttemptsSourceArgs,
  returns: v.array(attemptRow),
  handler: async (ctx, args) => {
    await requireActionInvocationSourceRead(args)
    const control = await readOwnedControl(ctx, args)
    return control === null ? [] : readAttemptsHandler(ctx, args)
  },
})

export const readAttemptSource = query({
  args: readAttemptSourceArgs,
  returns: v.union(attemptRow, v.null()),
  handler: async (ctx, args) => {
    await requireActionInvocationSourceRead(args)
    const control = await readOwnedControl(ctx, args)
    return control === null ? null : readAttemptHandler(ctx, args)
  },
})

export const readHistorySource = query({
  args: readHistorySourceArgs,
  returns: v.array(historyRow),
  handler: async (ctx, args) => {
    await requireActionInvocationSourceRead(args)
    const control = await readOwnedControl(ctx, args)
    return control === null ? [] : readHistoryHandler(ctx, args)
  },
})

export const readHistoryCommandSource = query({
  args: readHistoryCommandSourceArgs,
  returns: v.union(historyRow, v.null()),
  handler: async (ctx, args) => {
    await requireActionInvocationSourceRead(args)
    const control = await readOwnedControl(ctx, args)
    return control === null ? null : readHistoryCommandHandler(ctx, args)
  },
})
