import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { mutation, query, type MutationCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { literalUnion } from '../src/modules/common/convex-literals'

import {
  HarnessRunStatusValues,
  HarnessSessionEntryKindValues,
} from '../src/modules/harness/harness.schema'
import type {
  HarnessRunStatus,
  HarnessSessionEntry,
  HarnessSessionEntryKind,
} from '../src/modules/harness/harness.schema'
import { createHarnessSessionEntry } from '../src/modules/harness/session-journal'

const harnessRunStatus = literalUnion(HarnessRunStatusValues)
const harnessSessionEntryKind = literalUnion(HarnessSessionEntryKindValues)

const appendConflictReason = v.union(
  v.literal('entry_id_conflict'),
  v.literal('idempotency_conflict'),
  v.literal('parent_conflict'),
)

const harnessSessionSummaryResult = v.object({
  sessionId: v.string(),
  ownerKey: v.string(),
  entryCount: v.number(),
  activeLeafEntryId: v.optional(v.string()),
  lastRunId: v.optional(v.string()),
  status: v.optional(harnessRunStatus),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const harnessSessionPublicSummaryResult = v.object({
  sessionId: v.string(),
  entryCount: v.number(),
  status: v.optional(harnessRunStatus),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const harnessSessionEntryReceiptResult = v.object({
  entryId: v.string(),
  sessionId: v.string(),
  runId: v.string(),
  turnId: v.optional(v.string()),
  seq: v.number(),
  parentEntryId: v.optional(v.string()),
  kind: harnessSessionEntryKind,
  status: v.optional(harnessRunStatus),
  idempotencyKey: v.string(),
  createdAt: v.number(),
})

const harnessSessionPrivateEntryResult = v.object({
  entryId: v.string(),
  sessionId: v.string(),
  ownerKey: v.string(),
  runId: v.string(),
  turnId: v.optional(v.string()),
  seq: v.number(),
  parentEntryId: v.optional(v.string()),
  kind: harnessSessionEntryKind,
  status: v.optional(harnessRunStatus),
  idempotencyKey: v.string(),
  requestHash: v.string(),
  createdAt: v.number(),
  payloadJson: v.string(),
  publicSummaryJson: v.optional(v.string()),
  privatePayloadJson: v.optional(v.string()),
  schemaVersion: v.number(),
  toolContractHash: v.optional(v.string()),
  sourceSnapshotHash: v.optional(v.string()),
})

const harnessSessionPublicEntryResult = v.object({
  seq: v.number(),
  kind: harnessSessionEntryKind,
  status: v.optional(harnessRunStatus),
  createdAt: v.number(),
  publicSummaryJson: v.optional(v.string()),
})

const appendHarnessSessionEntryResult = v.union(
  v.object({
    status: v.literal('accepted'),
    entry: harnessSessionEntryReceiptResult,
    activeLeafEntryId: v.string(),
  }),
  v.object({
    status: v.literal('replayed'),
    entry: harnessSessionEntryReceiptResult,
    activeLeafEntryId: v.optional(v.string()),
  }),
  v.object({
    status: v.literal('conflict'),
    reason: appendConflictReason,
    message: v.string(),
    activeLeafEntryId: v.optional(v.string()),
    existingEntry: v.optional(harnessSessionEntryReceiptResult),
    attemptedEntry: v.optional(harnessSessionEntryReceiptResult),
  }),
  v.object({
    status: v.literal('denied'),
    reason: v.string(),
    message: v.string(),
  }),
)

const finalizeAnswerTurnHarnessRunResult = v.union(
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
      v.literal('turn_not_found'),
      v.literal('snapshot_mismatch'),
      v.literal('evidence_conflict'),
      v.literal('entry_identity_mismatch'),
      v.literal('entry_id_conflict'),
      v.literal('idempotency_conflict'),
      v.literal('parent_conflict'),
      v.literal('stopped'),
      v.literal('generation_mismatch'),
      v.literal('lease_owner_mismatch'),
      v.literal('lease_expired'),
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

const listHarnessSessionEntriesResult = v.object({
  kind: v.literal('ok'),
  session: v.union(harnessSessionPublicSummaryResult, v.null()),
  entries: v.array(harnessSessionPublicEntryResult),
  limit: v.number(),
  truncated: v.boolean(),
})

const listHarnessRunEntriesResult = v.object({
  kind: v.literal('ok'),
  entries: v.array(harnessSessionPublicEntryResult),
  limit: v.number(),
  truncated: v.boolean(),
})

const readAdminHarnessSessionEntriesResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    session: v.union(harnessSessionSummaryResult, v.null()),
    entries: v.array(harnessSessionPrivateEntryResult),
    limit: v.number(),
    truncated: v.boolean(),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(v.literal('missing_membership'), v.literal('inactive_membership'), v.literal('action_not_allowed')),
    session: v.null(),
    entries: v.array(harnessSessionPrivateEntryResult),
    limit: v.number(),
    truncated: v.literal(false),
  }),
)

export const appendHarnessSessionEntry = mutation({
  args: {
    ownerKey: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    entryId: v.string(),
    sessionId: v.string(),
    runId: v.string(),
    turnId: v.optional(v.string()),
    parentEntryId: v.optional(v.string()),
    seq: v.optional(v.number()),
    kind: harnessSessionEntryKind,
    status: v.optional(harnessRunStatus),
    idempotencyKey: v.optional(v.string()),
    requestHash: v.optional(v.string()),
    createdAt: v.number(),
    payloadJson: v.string(),
    publicSummaryJson: v.optional(v.string()),
    privatePayloadJson: v.optional(v.string()),
    schemaVersion: v.optional(v.number()),
    toolContractHash: v.optional(v.string()),
    sourceSnapshotHash: v.optional(v.string()),
  },
  returns: appendHarnessSessionEntryResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'harness_session')
    if (sourceWrite.kind === 'rejected') {
      return {
        status: 'denied' as const,
        reason: sourceWrite.reason,
        message: 'Harness session append requires server source-write admission.',
      }
    }

    const idempotencyKey = args.idempotencyKey ?? args.entryId
    const [existingByIdempotency, session] = await Promise.all([
      ctx.db
        .query('harnessSessionEntries')
        .withIndex('by_sessionId_idempotencyKey', (query) =>
          query.eq('sessionId', args.sessionId).eq('idempotencyKey', idempotencyKey)
        )
        .unique(),
      ctx.db
        .query('harnessSessions')
        .withIndex('by_sessionId', (query) => query.eq('sessionId', args.sessionId))
        .unique(),
    ])
    const activeLeafEntryId = session?.activeLeafEntryId

    if (existingByIdempotency !== null) {
      const replayAttempt = normalizeEntryForStorage(args, args.ownerKey, {
        parentEntryId: existingByIdempotency.parentEntryId,
        seq: existingByIdempotency.seq,
        idempotencyKey,
      })

      if (replayAttempt.requestHash === existingByIdempotency.requestHash) {
        return {
          status: 'replayed' as const,
          entry: toEntryReceipt(existingByIdempotency),
          ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
        }
      }

      return conflictResult({
        reason: 'idempotency_conflict',
        message: `Idempotency key ${idempotencyKey} was already used with a different request hash.`,
        activeLeafEntryId,
        existingEntry: toEntryReceipt(existingByIdempotency),
        attemptedEntry: toEntryReceipt(replayAttempt),
      })
    }

    if (session !== null && session.ownerKey !== args.ownerKey) {
      return conflictResult({
        reason: 'parent_conflict',
        message: 'Session owner does not match the existing harness session.',
        activeLeafEntryId,
      })
    }

    const expectedParentEntryId = session === null ? undefined : activeLeafEntryId
    const expectedSeq = session === null ? 1 : session.entryCount + 1
    const parentEntryId = args.parentEntryId ?? expectedParentEntryId
    const seq = args.seq ?? expectedSeq

    const attemptedEntry = normalizeEntryForStorage(args, args.ownerKey, {
      parentEntryId,
      seq,
      idempotencyKey,
    })

    const existingByEntryId = await ctx.db
      .query('harnessSessionEntries')
      .withIndex('by_sessionId_entryId', (query) =>
        query.eq('sessionId', args.sessionId).eq('entryId', args.entryId)
      )
      .unique()

    if (existingByEntryId !== null) {
      return conflictResult({
        reason: 'entry_id_conflict',
        message: `Entry id ${args.entryId} already exists in session ${args.sessionId}.`,
        activeLeafEntryId,
        existingEntry: toEntryReceipt(existingByEntryId),
        attemptedEntry: toEntryReceipt(attemptedEntry),
      })
    }

    if (parentEntryId !== expectedParentEntryId || seq !== expectedSeq) {
      return conflictResult({
        reason: 'parent_conflict',
        message: `Parent ${parentEntryId ?? 'root'} and seq ${seq} do not match active leaf ${expectedParentEntryId ?? 'root'} and next seq ${expectedSeq}.`,
        activeLeafEntryId,
        attemptedEntry: toEntryReceipt(attemptedEntry),
      })
    }

    await ctx.db.insert('harnessSessionEntries', attemptedEntry)

    const sessionPatch = {
      activeLeafEntryId: attemptedEntry.entryId,
      lastRunId: attemptedEntry.runId,
      entryCount: attemptedEntry.seq,
      updatedAt: attemptedEntry.createdAt,
      ...(attemptedEntry.status === undefined ? {} : { status: attemptedEntry.status }),
    }

    if (session === null) {
      await ctx.db.insert('harnessSessions', {
        sessionId: attemptedEntry.sessionId,
        ownerKey: args.ownerKey,
        entryCount: attemptedEntry.seq,
        activeLeafEntryId: attemptedEntry.entryId,
        lastRunId: attemptedEntry.runId,
        createdAt: attemptedEntry.createdAt,
        updatedAt: attemptedEntry.createdAt,
        ...(attemptedEntry.status === undefined ? {} : { status: attemptedEntry.status }),
      })
    } else {
      await ctx.db.patch(session._id, sessionPatch)
    }

    return {
      status: 'accepted' as const,
      entry: toEntryReceipt(attemptedEntry),
      activeLeafEntryId: attemptedEntry.entryId,
    }
  },
})

export const finalizeAnswerTurnHarnessRun = mutation({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    leaseOwner: v.string(),
    finalStatus: v.union(v.literal('complete'), v.literal('error')),
    snapshotHash: v.string(),
    evidenceJson: v.string(),
    finalizationHash: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    entries: v.array(
      v.object({
        ownerKey: v.string(),
        entryId: v.string(),
        sessionId: v.string(),
        runId: v.string(),
        turnId: v.optional(v.string()),
        parentEntryId: v.optional(v.string()),
        seq: v.optional(v.number()),
        kind: harnessSessionEntryKind,
        status: v.optional(harnessRunStatus),
        idempotencyKey: v.optional(v.string()),
        requestHash: v.optional(v.string()),
        createdAt: v.number(),
        payloadJson: v.string(),
        publicSummaryJson: v.optional(v.string()),
        privatePayloadJson: v.optional(v.string()),
        schemaVersion: v.optional(v.number()),
        toolContractHash: v.optional(v.string()),
        sourceSnapshotHash: v.optional(v.string()),
      }),
    ),
  },
  returns: finalizeAnswerTurnHarnessRunResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'harness_session')
    if (sourceWrite.kind === 'rejected') {
      return {
        status: 'denied' as const,
        reason: sourceWrite.reason,
        message: 'Answer harness finalization requires server source-write admission.',
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
      reservation.sessionId !== args.sessionId ||
      reservation.threadId !== args.threadId ||
      reservation.turnId !== args.turnId ||
      reservation.seq !== args.turnSeq
    ) {
      return {
        status: 'conflict' as const,
        reason: 'reservation_identity_mismatch' as const,
        message: 'Answer turn reservation identity does not match finalization.',
      }
    }
    if (reservation.requestDigest !== args.requestDigest) {
      return {
        status: 'conflict' as const,
        reason: 'request_digest_mismatch' as const,
        message: 'Answer turn request digest does not match reservation.',
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
    if (reservation.state === 'stopped') {
      return {
        status: 'conflict' as const,
        reason: 'stopped' as const,
        message: 'Answer turn was stopped before finalization.',
      }
    }
    if (reservation.state === 'reserved') {
      return {
        status: 'conflict' as const,
        reason: 'turn_not_found' as const,
        message: 'Answer turn has not been durably persisted.',
      }
    }
    if (reservation.state !== 'finalized') {
      if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
        return {
          status: 'conflict' as const,
          reason: 'generation_mismatch' as const,
          message: 'Answer turn generation does not match finalization.',
        }
      }
      if (reservation.leaseOwner !== args.leaseOwner) {
        return {
          status: 'conflict' as const,
          reason: 'lease_owner_mismatch' as const,
          message: 'Answer turn lease owner does not match finalization.',
        }
      }
      if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
        return {
          status: 'conflict' as const,
          reason: 'lease_expired' as const,
          message: 'Answer turn lease has expired.',
        }
      }
    }
    if (
      reservation.state === 'finalized' &&
      reservation.harnessFinalizationDigest !== args.finalizationHash
    ) {
      return {
        status: 'conflict' as const,
        reason: 'evidence_conflict' as const,
        message: 'Answer turn was already finalized with different harness evidence.',
      }
    }

    const turn = await ctx.db
      .query('answerTurns')
      .withIndex('by_turnId', (query) => query.eq('turnId', args.turnId))
      .unique()
    if (turn === null || turn.threadId !== args.threadId || turn.seq !== args.turnSeq) {
      return {
        status: 'conflict' as const,
        reason: 'turn_not_found' as const,
        message: `Answer turn ${args.turnId} does not exist for this reservation.`,
      }
    }
    if (turn.status === 'stopped') {
      return {
        status: 'conflict' as const,
        reason: 'stopped' as const,
        message: 'Answer turn was stopped before finalization.',
      }
    }
    if (turn.snapshotHash !== args.snapshotHash) {
      return {
        status: 'conflict' as const,
        reason: 'snapshot_mismatch' as const,
        message: `Answer turn ${args.turnId} snapshot hash does not match final harness evidence.`,
      }
    }

    const currentEvidenceJson = turn.evidenceJson
    const currentFinalizationHash = readHarnessFinalizationHash(currentEvidenceJson)
    if (currentFinalizationHash !== undefined && currentFinalizationHash !== args.finalizationHash) {
      return {
        status: 'conflict' as const,
        reason: 'evidence_conflict' as const,
        message: `Answer turn ${args.turnId} was already finalized with different harness evidence.`,
      }
    }

    const validation = await validateHarnessSessionEntryBatch(
      ctx.db,
      args.entries.map(coerceFinalizationEntryInput),
      {
        sessionId: args.sessionId,
        runId: args.turnId,
        turnId: args.turnId,
      },
    )
    if (validation.status === 'conflict') {
      return validation
    }

    const evidenceAlreadyFinal =
      reservation.state === 'finalized' &&
      reservation.harnessFinalizationDigest === args.finalizationHash &&
      (currentFinalizationHash === args.finalizationHash || currentEvidenceJson === args.evidenceJson)
    if (!evidenceAlreadyFinal) {
      await ctx.db.patch(turn._id, {
        evidenceJson: args.evidenceJson,
        status: args.finalStatus,
      })
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

    if (reservation.state !== 'finalized') {
      await ctx.db.patch(reservation._id, {
        state: 'finalized',
        finalStatus: args.finalStatus,
        harnessFinalizationDigest: args.finalizationHash,
        checkpointJson: undefined,
        checkpointDigest: undefined,
        checkpointStep: undefined,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: Date.now(),
      })
    }

    const activeLeafEntryId = validation.entriesToInsert.at(-1)?.entryId ?? validation.activeLeafEntryId
    const common = {
      turnId: args.turnId,
      finalizationHash: args.finalizationHash,
      entriesAccepted: validation.entriesToInsert.length,
      entriesReplayed: validation.entriesReplayed,
      ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
    }

    return common.entriesAccepted === 0 && evidenceAlreadyFinal
      ? { status: 'replayed' as const, ...common, entriesAccepted: 0 as const }
      : { status: 'accepted' as const, ...common }
  },
})

export const listHarnessSessionEntries = query({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: listHarnessSessionEntriesResult,
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit)
    const [session, rows] = await Promise.all([
      ctx.db
        .query('harnessSessions')
        .withIndex('by_sessionId', (query) => query.eq('sessionId', args.sessionId))
        .unique(),
      ctx.db
        .query('harnessSessionEntries')
        .withIndex('by_sessionId_seq', (query) => query.eq('sessionId', args.sessionId))
        .order('desc')
        .take(limit),
    ])

    return {
      kind: 'ok' as const,
      session: session === null ? null : toPublicSessionSummary(session),
      entries: rows.map(toPublicEntry).sort(comparePublicEntries),
      limit,
      truncated: session !== null && session.entryCount > rows.length,
    }
  },
})

export const listHarnessRunEntries = query({
  args: {
    runId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: listHarnessRunEntriesResult,
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit)
    const rows = await ctx.db
      .query('harnessSessionEntries')
      .withIndex('by_runId_seq', (query) => query.eq('runId', args.runId))
      .order('desc')
      .take(limit)

    return {
      kind: 'ok' as const,
      entries: rows.map(toPublicEntry).sort(comparePublicEntries),
      limit,
      truncated: rows.length === limit,
    }
  },
})

export const readAdminHarnessSessionEntries = query({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: readAdminHarnessSessionEntriesResult,
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit)
    const authority = await resolveAdminAuthority({ db: ctx.db, auth: ctx.auth }, 'read_admin_readbacks')
    if (authority.kind === 'denied') {
      return {
        kind: 'denied' as const,
        reason: authority.reason,
        session: null,
        entries: [],
        limit,
        truncated: false as const,
      }
    }

    const [session, rows] = await Promise.all([
      ctx.db
        .query('harnessSessions')
        .withIndex('by_sessionId', (query) => query.eq('sessionId', args.sessionId))
        .unique(),
      ctx.db
        .query('harnessSessionEntries')
        .withIndex('by_sessionId_seq', (query) => query.eq('sessionId', args.sessionId))
        .order('desc')
        .take(limit),
    ])

    return {
      kind: 'allowed' as const,
      session: session === null ? null : toSessionSummary(session),
      entries: rows.map(toPrivateEntry).sort(comparePrivateEntries),
      limit,
      truncated: session !== null && session.entryCount > rows.length,
    }
  },
})

function coerceFinalizationEntryInput(input: {
  ownerKey: string
  entryId: string
  sessionId: string
  runId: string
  turnId?: string
  parentEntryId?: string
  seq?: number
  kind?: unknown
  status?: unknown
  idempotencyKey?: string
  requestHash?: string
  createdAt: number
  payloadJson: string
  publicSummaryJson?: string
  privatePayloadJson?: string
  schemaVersion?: number
  toolContractHash?: string
  sourceSnapshotHash?: string
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

function readHarnessFinalizationHash(evidenceJson: string): string | undefined {
  try {
    const evidence = JSON.parse(evidenceJson) as { harnessFinalization?: { finalizationHash?: unknown } }
    const value = evidence.harnessFinalization?.finalizationHash
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

function normalizeEntryForStorage(
  input: {
    entryId: string
    sessionId: string
    runId: string
    turnId?: string
    kind?: unknown
    status?: unknown
    requestHash?: string
    createdAt: number
    payloadJson: string
    publicSummaryJson?: string
    privatePayloadJson?: string
    schemaVersion?: number
    toolContractHash?: string
    sourceSnapshotHash?: string
  },
  ownerKey: string,
  defaults: {
    parentEntryId: string | undefined
    seq: number
    idempotencyKey: string
  },
): HarnessSessionEntry & { ownerKey: string } {
  const status = harnessStatusValue(input.status)
  return {
    ownerKey,
    ...createHarnessSessionEntry({
      entryId: input.entryId,
      sessionId: input.sessionId,
      runId: input.runId,
      ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
      seq: defaults.seq,
      ...(defaults.parentEntryId === undefined ? {} : { parentEntryId: defaults.parentEntryId }),
      kind: harnessKindValue(input.kind),
      ...(status === undefined ? {} : { status }),
      idempotencyKey: defaults.idempotencyKey,
      ...(input.requestHash === undefined ? {} : { requestHash: input.requestHash }),
      createdAt: input.createdAt,
      payloadJson: input.payloadJson,
      ...(input.publicSummaryJson === undefined ? {} : { publicSummaryJson: input.publicSummaryJson }),
      ...(input.privatePayloadJson === undefined ? {} : { privatePayloadJson: input.privatePayloadJson }),
      ...(input.schemaVersion === undefined ? {} : { schemaVersion: input.schemaVersion }),
      ...(input.toolContractHash === undefined ? {} : { toolContractHash: input.toolContractHash }),
      ...(input.sourceSnapshotHash === undefined ? {} : { sourceSnapshotHash: input.sourceSnapshotHash }),
    }),
  }
}

function conflictResult(input: {
  reason: 'entry_id_conflict' | 'idempotency_conflict' | 'parent_conflict'
  message: string
  activeLeafEntryId: string | undefined
  existingEntry?: ReturnType<typeof toEntryReceipt>
  attemptedEntry?: ReturnType<typeof toEntryReceipt>
}): {
  status: 'conflict'
  reason: 'entry_id_conflict' | 'idempotency_conflict' | 'parent_conflict'
  message: string
  activeLeafEntryId?: string
  existingEntry?: ReturnType<typeof toEntryReceipt>
  attemptedEntry?: ReturnType<typeof toEntryReceipt>
} {
  return {
    status: 'conflict',
    reason: input.reason,
    message: input.message,
    ...(input.activeLeafEntryId === undefined ? {} : { activeLeafEntryId: input.activeLeafEntryId }),
    ...(input.existingEntry === undefined ? {} : { existingEntry: input.existingEntry }),
    ...(input.attemptedEntry === undefined ? {} : { attemptedEntry: input.attemptedEntry }),
  }
}

function toSessionSummary(row: Doc<'harnessSessions'>): {
  sessionId: string
  ownerKey: string
  entryCount: number
  activeLeafEntryId?: string
  lastRunId?: string
  status?: HarnessRunStatus
  createdAt: number
  updatedAt: number
} {
  const status = harnessStatusValue(row.status)
  return {
    sessionId: row.sessionId,
    ownerKey: row.ownerKey,
    entryCount: row.entryCount,
    ...(row.activeLeafEntryId === undefined ? {} : { activeLeafEntryId: row.activeLeafEntryId }),
    ...(row.lastRunId === undefined ? {} : { lastRunId: row.lastRunId }),
    ...(status === undefined ? {} : { status }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toPublicSessionSummary(row: Doc<'harnessSessions'>): {
  sessionId: string
  entryCount: number
  status?: HarnessRunStatus
  createdAt: number
  updatedAt: number
} {
  const status = harnessStatusValue(row.status)
  return {
    sessionId: row.sessionId,
    entryCount: row.entryCount,
    ...(status === undefined ? {} : { status }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toEntryReceipt(row: Doc<'harnessSessionEntries'> | (HarnessSessionEntry & { ownerKey?: string })): {
  entryId: string
  sessionId: string
  runId: string
  turnId?: string
  seq: number
  parentEntryId?: string
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey: string
  createdAt: number
} {
  const status = harnessStatusValue(row.status)
  return {
    entryId: row.entryId,
    sessionId: row.sessionId,
    runId: row.runId,
    ...(row.turnId === undefined ? {} : { turnId: row.turnId }),
    seq: row.seq,
    ...(row.parentEntryId === undefined ? {} : { parentEntryId: row.parentEntryId }),
    kind: harnessKindValue(row.kind),
    ...(status === undefined ? {} : { status }),
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  }
}

function toPrivateEntry(row: Doc<'harnessSessionEntries'>): {
  entryId: string
  sessionId: string
  ownerKey: string
  runId: string
  turnId?: string
  seq: number
  parentEntryId?: string
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey: string
  requestHash: string
  createdAt: number
  payloadJson: string
  publicSummaryJson?: string
  privatePayloadJson?: string
  schemaVersion: number
  toolContractHash?: string
  sourceSnapshotHash?: string
} {
  const receipt = toEntryReceipt(row)
  return {
    ...receipt,
    ownerKey: row.ownerKey,
    requestHash: row.requestHash,
    payloadJson: row.payloadJson,
    ...(row.publicSummaryJson === undefined ? {} : { publicSummaryJson: row.publicSummaryJson }),
    ...(row.privatePayloadJson === undefined ? {} : { privatePayloadJson: row.privatePayloadJson }),
    schemaVersion: row.schemaVersion,
    ...(row.toolContractHash === undefined ? {} : { toolContractHash: row.toolContractHash }),
    ...(row.sourceSnapshotHash === undefined ? {} : { sourceSnapshotHash: row.sourceSnapshotHash }),
  }
}

function toPublicEntry(row: Doc<'harnessSessionEntries'>): {
  seq: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  createdAt: number
  publicSummaryJson?: string
} {
  const status = harnessStatusValue(row.status)
  return {
    seq: row.seq,
    kind: harnessKindValue(row.kind),
    ...(status === undefined ? {} : { status }),
    createdAt: row.createdAt,
    ...(row.publicSummaryJson === undefined ? {} : { publicSummaryJson: row.publicSummaryJson }),
  }
}

function comparePublicEntries(a: ReturnType<typeof toPublicEntry>, b: ReturnType<typeof toPublicEntry>): number {
  return a.seq - b.seq || a.createdAt - b.createdAt
}

function comparePrivateEntries(a: ReturnType<typeof toPrivateEntry>, b: ReturnType<typeof toPrivateEntry>): number {
  return a.seq - b.seq || a.createdAt - b.createdAt || a.entryId.localeCompare(b.entryId)
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 100
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 500)
}

function harnessKindValue(value: unknown): HarnessSessionEntryKind {
  return HarnessSessionEntryKindValues.includes(value as HarnessSessionEntryKind)
    ? value as HarnessSessionEntryKind
    : 'turn.started'
}

function harnessStatusValue(value: unknown): HarnessRunStatus | undefined {
  return HarnessRunStatusValues.includes(value as HarnessRunStatus) ? value as HarnessRunStatus : undefined
}
