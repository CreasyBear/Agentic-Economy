import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { requireSourceWrite, type SourceWriteArgs } from './sourceWriteAdmission'
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

export const harnessRunStatus = literalUnion(HarnessRunStatusValues)
export const harnessSessionEntryKind = literalUnion(HarnessSessionEntryKindValues)

const appendConflictReason = v.union(
  v.literal('entry_id_conflict'),
  v.literal('idempotency_conflict'),
  v.literal('parent_conflict'),
)

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

export const appendHarnessSessionEntryResult = v.union(
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

export type AppendHarnessSessionEntryHandlerArgs = SourceWriteArgs & {
  ownerKey: string
  operationKey: string
  correlationId: string
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

export async function appendHarnessSessionEntryHandler(
  ctx: MutationCtx,
  args: AppendHarnessSessionEntryHandlerArgs,
) {
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
}

export function normalizeEntryForStorage(
  input: {
    entryId: string
    sessionId: string
    runId: string
    turnId?: string | undefined
    kind?: unknown
    status?: unknown
    requestHash?: string | undefined
    createdAt: number
    payloadJson: string
    publicSummaryJson?: string | undefined
    privatePayloadJson?: string | undefined
    schemaVersion?: number | undefined
    toolContractHash?: string | undefined
    sourceSnapshotHash?: string | undefined
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

export function toEntryReceipt(row: Doc<'harnessSessionEntries'> | (HarnessSessionEntry & { ownerKey?: string })): {
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

export function harnessKindValue(value: unknown): HarnessSessionEntryKind {
  return HarnessSessionEntryKindValues.includes(value as HarnessSessionEntryKind)
    ? value as HarnessSessionEntryKind
    : 'turn.started'
}

export function harnessStatusValue(value: unknown): HarnessRunStatus | undefined {
  return HarnessRunStatusValues.includes(value as HarnessRunStatus) ? value as HarnessRunStatus : undefined
}
