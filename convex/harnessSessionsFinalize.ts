import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { requireSourceWrite, type SourceWriteArgs } from './sourceWriteAdmission'
import { literalUnion } from '../src/modules/common/convex-literals'

import {
  AnswerToolCallStatusValues,
  AnswerToolIdValues,
  type AnswerToolCallStatus,
  type AnswerToolId,
  type FollowUpIntent,
} from '../src/modules/answer-thread/answer-thread.schema'
import {
  toolCallsMatch,
} from '../src/modules/answer-thread/convex'
import type {
  HarnessRunStatus,
  HarnessSessionEntry,
  HarnessSessionEntryKind,
} from '../src/modules/harness/harness.schema'
import {
  harnessKindValue,
  harnessStatusValue,
  normalizeEntryForStorage,
} from './harnessSessionsAppend'

const ANSWER_FINALIZATION_TOOL_LIMIT = 100

export const answerTurnToolCallInput = v.object({
  toolCallId: v.string(),
  seq: v.number(),
  toolId: literalUnion(AnswerToolIdValues),
  inputJson: v.string(),
  resultSummaryJson: v.string(),
  resultJson: v.string(),
  resultHash: v.string(),
  status: literalUnion(AnswerToolCallStatusValues),
  createdAt: v.number(),
})

export const finalizeReservedAnswerTurnResult = v.union(
  v.object({
    status: v.literal('accepted'),
    turnId: v.string(),
    finalizationHash: v.string(),
    entriesAccepted: v.number(),
    entriesReplayed: v.number(),
    activeLeafEntryId: v.optional(v.string()),
  }),
  v.object({
    status: v.literal('replayed'),
    turnId: v.string(),
    finalizationHash: v.string(),
    entriesAccepted: v.literal(0),
    entriesReplayed: v.number(),
    activeLeafEntryId: v.optional(v.string()),
  }),
  v.object({
    status: v.literal('conflict'),
    reason: v.union(
      v.literal('reservation_not_found'),
      v.literal('reservation_identity_mismatch'),
      v.literal('request_digest_mismatch'),
      v.literal('generation_mismatch'),
      v.literal('turn_not_found'),
      v.literal('turn_conflict'),
      v.literal('snapshot_mismatch'),
      v.literal('evidence_conflict'),
      v.literal('answer_digest_conflict'),
      v.literal('tool_call_conflict'),
      v.literal('entry_identity_mismatch'),
      v.literal('entry_id_conflict'),
      v.literal('idempotency_conflict'),
      v.literal('parent_conflict'),
      v.literal('stopped'),
    ),
    message: v.string(),
    activeLeafEntryId: v.optional(v.string()),
  }),
  v.object({
    status: v.literal('denied'),
    reason: v.string(),
    message: v.string(),
  }),
)

export type FinalizeHarnessSessionEntryInput = {
  ownerKey: string
  entryId: string
  sessionId: string
  runId: string
  turnId?: string | undefined
  parentEntryId?: string | undefined
  seq?: number | undefined
  kind?: unknown
  status?: unknown
  idempotencyKey?: string | undefined
  requestHash?: string | undefined
  createdAt: number
  payloadJson: string
  publicSummaryJson?: string | undefined
  privatePayloadJson?: string | undefined
  schemaVersion?: number | undefined
  toolContractHash?: string | undefined
  sourceSnapshotHash?: string | undefined
}

export type FinalizeReservedAnswerTurnHandlerArgs = SourceWriteArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  expectedGeneration: number
  createdAt: number
  answerDigest: string
  query: string
  intent?: unknown
  finalStatus: 'complete' | 'error'
  snapshotHash: string
  evidenceJson: string
  proseJson: string
  artifactKindsJson: string
  errorCopyId?: string | undefined
  errorProblemJson?: string | undefined
  finalizationHash: string
  toolCalls: Array<{
    toolCallId: string
    seq: number
    toolId?: unknown
    inputJson: string
    resultSummaryJson: string
    resultJson: string
    resultHash: string
    status?: unknown
    createdAt: number
  }>
  operationKey: string
  correlationId: string
  entries: Array<FinalizeHarnessSessionEntryInput>
}

export async function finalizeReservedAnswerTurnHandler(
  ctx: MutationCtx,
  args: FinalizeReservedAnswerTurnHandlerArgs,
) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'harness_session')
  if (sourceWrite.kind === 'rejected') {
    return {
      status: 'denied' as const,
      reason: sourceWrite.reason,
      message: 'Answer finalization requires server source-write admission.',
    }
  }

  const reservation = await ctx.db
    .query('answerTurnReservations')
    .withIndex('by_reservationKey', (query) => query.eq('reservationKey', args.reservationKey))
    .unique()
  if (reservation === null) {
    return {
      status: 'conflict' as const,
      reason: 'reservation_not_found' as const,
      message: 'Answer turn reservation does not exist.',
    }
  }
  if (
    reservation.sessionId !== args.sessionId
    || reservation.threadId !== args.threadId
    || reservation.turnId !== args.turnId
    || reservation.seq !== args.turnSeq
  ) {
    return {
      status: 'conflict' as const,
      reason: 'reservation_identity_mismatch' as const,
      message: 'Answer turn reservation identity does not match finalization.',
    }
  }
  if (reservation.requestDigest !== args.requestDigest || reservation.query !== args.query) {
    return {
      status: 'conflict' as const,
      reason: 'request_digest_mismatch' as const,
      message: 'Answer turn request identity does not match finalization.',
    }
  }
  if (reservation.state === 'stopped') {
    return {
      status: 'conflict' as const,
      reason: 'stopped' as const,
      message: 'Answer turn was stopped before finalization.',
    }
  }
  if (reservation.generation !== args.expectedGeneration) {
    return {
      status: 'conflict' as const,
      reason: 'generation_mismatch' as const,
      message: 'Answer turn generation does not match finalization.',
    }
  }
  const thread = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
    .unique()
  if (thread === null || thread.pseudonymousSessionId !== args.sessionId) {
    return {
      status: 'conflict' as const,
      reason: 'parent_conflict' as const,
      message: 'Answer thread parent is not available for finalization.',
    }
  }

  const turn = await ctx.db
    .query('answerTurns')
    .withIndex('by_turnId', (query) => query.eq('turnId', args.turnId))
    .unique()
  const existingTools = await ctx.db
    .query('answerToolCalls')
    .withIndex('by_turn_seq', (query) => query.eq('turnId', args.turnId))
    .order('asc')
    .take(ANSWER_FINALIZATION_TOOL_LIMIT)
  const incomingTools = args.toolCalls.map((call) => ({
    toolCallId: call.toolCallId,
    seq: call.seq,
    toolId: call.toolId as AnswerToolId,
    inputJson: call.inputJson,
    resultSummaryJson: call.resultSummaryJson,
    resultJson: call.resultJson,
    resultHash: call.resultHash,
    status: call.status as AnswerToolCallStatus,
    createdAt: call.createdAt,
  }))
  const storedTools = existingTools.map((call) => ({
    toolCallId: call.toolCallId,
    seq: call.seq,
    toolId: call.toolId,
    inputJson: call.inputJson,
    resultSummaryJson: call.resultSummaryJson,
    resultJson: call.resultJson,
    resultHash: call.resultHash,
    status: call.status,
    createdAt: call.createdAt,
  }))
  const turnMatches =
    turn !== null
    && turn.threadId === args.threadId
    && turn.seq === args.turnSeq
    && turn.query === args.query
    && turn.intent === args.intent
    && turn.evidenceJson === args.evidenceJson
    && turn.snapshotHash === args.snapshotHash
    && turn.proseJson === args.proseJson
    && turn.artifactKindsJson === args.artifactKindsJson
    && turn.status === args.finalStatus
    && turn.createdAt === args.createdAt
    && turn.errorCopyId === args.errorCopyId
    && turn.errorProblemJson === args.errorProblemJson
  if (reservation.state === 'finalized') {
    if (reservation.answerDigest !== args.answerDigest) {
      return {
        status: 'conflict' as const,
        reason: 'answer_digest_conflict' as const,
        message: 'Answer turn was finalized with a different answer digest.',
      }
    }
    if (reservation.harnessFinalizationDigest !== args.finalizationHash) {
      return {
        status: 'conflict' as const,
        reason: 'evidence_conflict' as const,
        message: 'Answer turn was finalized with different harness evidence.',
      }
    }
    if (!turnMatches) {
      return {
        status: 'conflict' as const,
        reason: 'turn_conflict' as const,
        message: 'Answer turn replay does not match the finalized row.',
      }
    }
    if (!toolCallsMatch(storedTools, incomingTools)) {
      return {
        status: 'conflict' as const,
        reason: 'tool_call_conflict' as const,
        message: 'Answer tool-call replay does not match the finalized rows.',
      }
    }
    const replayValidation = await validateHarnessSessionEntryBatch(
      ctx.db,
      args.entries.map(coerceFinalizationEntryInput),
      { sessionId: args.sessionId, runId: args.turnId, turnId: args.turnId },
    )
    if (replayValidation.status === 'conflict') return replayValidation
    const activeLeafEntryId = replayValidation.activeLeafEntryId
    return {
      status: 'replayed' as const,
      turnId: args.turnId,
      finalizationHash: args.finalizationHash,
      entriesAccepted: 0 as const,
      entriesReplayed: replayValidation.entriesReplayed,
      ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
    }
  }
  if (turn !== null && !turnMatches) {
    return {
      status: 'conflict' as const,
      reason: 'turn_conflict' as const,
      message: 'Answer turn already exists with different finalization material.',
    }
  }
  if (turn !== null && !toolCallsMatch(storedTools, incomingTools)) {
    return {
      status: 'conflict' as const,
      reason: 'tool_call_conflict' as const,
      message: 'Answer tool-call rows already exist with different finalization material.',
    }
  }

  const validation = await validateHarnessSessionEntryBatch(
    ctx.db,
    args.entries.map(coerceFinalizationEntryInput),
    { sessionId: args.sessionId, runId: args.turnId, turnId: args.turnId },
  )
  if (validation.status === 'conflict') return validation

  const timestamp = Date.now()
  if (turn === null) {
    await ctx.db.insert('answerTurns', {
      turnId: args.turnId,
      threadId: args.threadId,
      seq: args.turnSeq,
      query: args.query,
      intent: args.intent as FollowUpIntent,
      evidenceJson: args.evidenceJson,
      snapshotHash: args.snapshotHash,
      proseJson: args.proseJson,
      artifactKindsJson: args.artifactKindsJson,
      status: args.finalStatus,
      ...(args.errorCopyId === undefined ? {} : { errorCopyId: args.errorCopyId }),
      ...(args.errorProblemJson === undefined ? {} : { errorProblemJson: args.errorProblemJson }),
      createdAt: args.createdAt,
    })
    for (const call of args.toolCalls) {
      await ctx.db.insert('answerToolCalls', {
        toolCallId: call.toolCallId,
        turnId: args.turnId,
        seq: call.seq,
        toolId: call.toolId as AnswerToolId,
        inputJson: call.inputJson,
        resultSummaryJson: call.resultSummaryJson,
        resultJson: call.resultJson,
        resultHash: call.resultHash,
        status: call.status as AnswerToolCallStatus,
        createdAt: call.createdAt,
      })
    }
  }
  for (const entry of validation.entriesToInsert) {
    await ctx.db.insert('harnessSessionEntries', entry)
  }
  if (validation.entriesToInsert.length > 0) {
    const lastEntry = validation.entriesToInsert.at(-1)
    if (lastEntry !== undefined) {
      await upsertHarnessSessionForFinalization(ctx.db, validation.session, lastEntry)
    }
  }
  await ctx.db.patch(reservation._id, {
    state: 'finalized',
    finalStatus: args.finalStatus,
    answerDigest: args.answerDigest,
    harnessFinalizationDigest: args.finalizationHash,
    updatedAt: timestamp,
  })
  await ctx.db.patch(thread._id, { updatedAt: timestamp })

  const activeLeafEntryId = validation.entriesToInsert.at(-1)?.entryId ?? validation.activeLeafEntryId
  return {
    status: 'accepted' as const,
    turnId: args.turnId,
    finalizationHash: args.finalizationHash,
    entriesAccepted: validation.entriesToInsert.length,
    entriesReplayed: validation.entriesReplayed,
    ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
  }
}

function coerceFinalizationEntryInput(input: {
  ownerKey: string
  entryId: string
  sessionId: string
  runId: string
  turnId?: string | undefined
  parentEntryId?: string | undefined
  seq?: number | undefined
  kind?: unknown
  status?: unknown
  idempotencyKey?: string | undefined
  requestHash?: string | undefined
  createdAt: number
  payloadJson: string
  publicSummaryJson?: string | undefined
  privatePayloadJson?: string | undefined
  schemaVersion?: number | undefined
  toolContractHash?: string | undefined
  sourceSnapshotHash?: string | undefined
}): {
  ownerKey: string
  entryId: string
  sessionId: string
  runId: string
  turnId?: string
  parentEntryId?: string
  seq?: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey?: string
  requestHash?: string
  createdAt: number
  payloadJson: string
  publicSummaryJson?: string
  privatePayloadJson?: string
  schemaVersion?: number
  toolContractHash?: string
  sourceSnapshotHash?: string
} {
  const status = harnessStatusValue(input.status)
  return {
    ownerKey: input.ownerKey,
    entryId: input.entryId,
    sessionId: input.sessionId,
    runId: input.runId,
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
    ...(input.parentEntryId === undefined ? {} : { parentEntryId: input.parentEntryId }),
    ...(input.seq === undefined ? {} : { seq: input.seq }),
    kind: harnessKindValue(input.kind),
    ...(status === undefined ? {} : { status }),
    ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
    ...(input.requestHash === undefined ? {} : { requestHash: input.requestHash }),
    createdAt: input.createdAt,
    payloadJson: input.payloadJson,
    ...(input.publicSummaryJson === undefined ? {} : { publicSummaryJson: input.publicSummaryJson }),
    ...(input.privatePayloadJson === undefined ? {} : { privatePayloadJson: input.privatePayloadJson }),
    ...(input.schemaVersion === undefined ? {} : { schemaVersion: input.schemaVersion }),
    ...(input.toolContractHash === undefined ? {} : { toolContractHash: input.toolContractHash }),
    ...(input.sourceSnapshotHash === undefined ? {} : { sourceSnapshotHash: input.sourceSnapshotHash }),
  }
}

async function validateHarnessSessionEntryBatch(
  db: MutationCtx['db'],
  entries: ReadonlyArray<{
    ownerKey: string
    entryId: string
    sessionId: string
    runId: string
    turnId?: string
    parentEntryId?: string
    seq?: number
    kind: HarnessSessionEntryKind
    status?: HarnessRunStatus
    idempotencyKey?: string
    requestHash?: string
    createdAt: number
    payloadJson: string
    publicSummaryJson?: string
    privatePayloadJson?: string
    schemaVersion?: number
    toolContractHash?: string
    sourceSnapshotHash?: string
  }>,
  expectedIdentity: {
    sessionId: string
    runId: string
    turnId: string
  },
): Promise<
  | {
      status: 'ok'
      session: Doc<'harnessSessions'> | null
      activeLeafEntryId: string | undefined
      entriesToInsert: Array<HarnessSessionEntry & { ownerKey: string }>
      entriesReplayed: number
    }
  | {
      status: 'conflict'
      reason: 'entry_identity_mismatch' | 'entry_id_conflict' | 'idempotency_conflict' | 'parent_conflict'
      message: string
      activeLeafEntryId?: string
    }
> {
  if (entries.length === 0) {
    return {
      status: 'ok',
      session: null,
      activeLeafEntryId: undefined,
      entriesToInsert: [],
      entriesReplayed: 0,
    }
  }

  const first = entries[0]
  if (first === undefined) {
    return {
      status: 'ok',
      session: null,
      activeLeafEntryId: undefined,
      entriesToInsert: [],
      entriesReplayed: 0,
    }
  }
  for (const entry of entries) {
    if (
      entry.sessionId !== expectedIdentity.sessionId ||
      entry.runId !== expectedIdentity.runId ||
      entry.turnId !== expectedIdentity.turnId
    ) {
      return {
        status: 'conflict',
        reason: 'entry_identity_mismatch',
        message: 'Finalization journal entries must match the answer turn identity.',
      }
    }
  }

  const session = await db
    .query('harnessSessions')
    .withIndex('by_sessionId', (query) => query.eq('sessionId', first.sessionId))
    .unique()

  let activeLeafEntryId = session?.activeLeafEntryId
  let entryCount = session === null ? 0 : session.entryCount
  let sessionOwnerKey = session === null ? first.ownerKey : session.ownerKey
  const entriesToInsert: Array<HarnessSessionEntry & { ownerKey: string }> = []
  let entriesReplayed = 0

  for (const entry of entries) {
    if (entry.sessionId !== first.sessionId) {
      return {
        status: 'conflict',
        reason: 'parent_conflict',
        message: 'Finalization journal entries must belong to one harness session.',
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      }
    }

    if (entry.ownerKey !== sessionOwnerKey) {
      return {
        status: 'conflict',
        reason: 'parent_conflict',
        message: 'Session owner does not match the existing harness session.',
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      }
    }

    const idempotencyKey = entry.idempotencyKey ?? entry.entryId
    const existingByIdempotency = await db
      .query('harnessSessionEntries')
      .withIndex('by_sessionId_idempotencyKey', (query) =>
        query.eq('sessionId', entry.sessionId).eq('idempotencyKey', idempotencyKey)
      )
      .unique()

    if (existingByIdempotency !== null) {
      const replayAttempt = normalizeEntryForStorage(entry, entry.ownerKey, {
        parentEntryId: existingByIdempotency.parentEntryId,
        seq: existingByIdempotency.seq,
        idempotencyKey,
      })
      if (replayAttempt.requestHash !== existingByIdempotency.requestHash) {
        return {
          status: 'conflict',
          reason: 'idempotency_conflict',
          message: `Idempotency key ${idempotencyKey} was already used with a different request hash.`,
          ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
        }
      }
      entriesReplayed += 1
      continue
    }

    const existingByEntryId = await db
      .query('harnessSessionEntries')
      .withIndex('by_sessionId_entryId', (query) =>
        query.eq('sessionId', entry.sessionId).eq('entryId', entry.entryId)
      )
      .unique()

    if (existingByEntryId !== null) {
      return {
        status: 'conflict',
        reason: 'entry_id_conflict',
        message: `Entry id ${entry.entryId} already exists in session ${entry.sessionId}.`,
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      }
    }

    const expectedParentEntryId = activeLeafEntryId
    const expectedSeq = entryCount + 1
    const parentEntryId = entry.parentEntryId ?? expectedParentEntryId
    const seq = entry.seq ?? expectedSeq
    if (parentEntryId !== expectedParentEntryId || seq !== expectedSeq) {
      return {
        status: 'conflict',
        reason: 'parent_conflict',
        message: `Parent ${parentEntryId ?? 'root'} and seq ${seq} do not match active leaf ${expectedParentEntryId ?? 'root'} and next seq ${expectedSeq}.`,
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      }
    }

    const attemptedEntry = normalizeEntryForStorage(entry, entry.ownerKey, {
      parentEntryId,
      seq,
      idempotencyKey,
    })
    entriesToInsert.push(attemptedEntry)
    activeLeafEntryId = attemptedEntry.entryId
    entryCount = attemptedEntry.seq
    sessionOwnerKey = attemptedEntry.ownerKey
  }

  return {
    status: 'ok',
    session,
    activeLeafEntryId,
    entriesToInsert,
    entriesReplayed,
  }
}

async function upsertHarnessSessionForFinalization(
  db: MutationCtx['db'],
  session: Doc<'harnessSessions'> | null,
  lastEntry: HarnessSessionEntry & { ownerKey: string },
): Promise<void> {
  const patch = {
    activeLeafEntryId: lastEntry.entryId,
    lastRunId: lastEntry.runId,
    entryCount: lastEntry.seq,
    updatedAt: lastEntry.createdAt,
    ...(lastEntry.status === undefined ? {} : { status: lastEntry.status }),
  }

  if (session === null) {
    await db.insert('harnessSessions', {
      sessionId: lastEntry.sessionId,
      ownerKey: lastEntry.ownerKey,
      entryCount: lastEntry.seq,
      activeLeafEntryId: lastEntry.entryId,
      lastRunId: lastEntry.runId,
      createdAt: lastEntry.createdAt,
      updatedAt: lastEntry.createdAt,
      ...(lastEntry.status === undefined ? {} : { status: lastEntry.status }),
    })
    return
  }

  await db.patch(session._id, patch)
}
