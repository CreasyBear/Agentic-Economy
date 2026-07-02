import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { resolveAdminAuthority } from './authz'
import { runtimeDb } from './source_state'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import type { RuntimeDocument, RuntimeQuery } from './source_state'
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

type OrderedRuntimeQuery = Omit<RuntimeQuery, 'order' | 'take'> & {
  order: (direction: 'asc' | 'desc') => OrderedRuntimeQuery
  take: (limit: number) => Promise<RuntimeDocument[]>
}

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
    reason: v.union(v.literal('missing_csrf'), v.literal('foreign_origin')),
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

export const appendHarnessSessionEntry = mutationGeneric({
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
    const sourceWrite = await requireSourceWrite(args, 'harness_session')
    if (sourceWrite.kind === 'rejected') {
      return {
        status: 'denied' as const,
        reason: sourceWrite.reason,
        message: 'Harness session append requires server source-write admission.',
      }
    }

    const db = runtimeDb(ctx.db)
    const idempotencyKey = args.idempotencyKey ?? args.entryId
    const existingByIdempotency = await db
      .query('harnessSessionEntries')
      .withIndex('by_sessionId_idempotencyKey', (query) =>
        query.eq('sessionId', args.sessionId).eq('idempotencyKey', idempotencyKey)
      )
      .unique()

    const session = await db
      .query('harnessSessions')
      .withIndex('by_sessionId', (query) => query.eq('sessionId', args.sessionId))
      .unique()
    const activeLeafEntryId = optionalStringField(session ?? {}, 'activeLeafEntryId')

    if (existingByIdempotency !== null) {
      const replayAttempt = normalizeEntryForStorage(args, args.ownerKey, {
        parentEntryId: optionalStringField(existingByIdempotency, 'parentEntryId'),
        seq: numberField(existingByIdempotency, 'seq'),
        idempotencyKey,
      })

      if (replayAttempt.requestHash === stringField(existingByIdempotency, 'requestHash')) {
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

    if (session !== null && stringField(session, 'ownerKey') !== args.ownerKey) {
      return conflictResult({
        reason: 'parent_conflict',
        message: 'Session owner does not match the existing harness session.',
        activeLeafEntryId,
      })
    }

    const expectedParentEntryId = session === null ? undefined : activeLeafEntryId
    const expectedSeq = session === null ? 1 : numberField(session, 'entryCount') + 1
    const parentEntryId = args.parentEntryId ?? expectedParentEntryId
    const seq = args.seq ?? expectedSeq

    const attemptedEntry = normalizeEntryForStorage(args, args.ownerKey, {
      parentEntryId,
      seq,
      idempotencyKey,
    })

    const existingByEntryId = await db
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

    await db.insert('harnessSessionEntries', attemptedEntry)

    const sessionPatch = {
      activeLeafEntryId: attemptedEntry.entryId,
      lastRunId: attemptedEntry.runId,
      entryCount: attemptedEntry.seq,
      updatedAt: attemptedEntry.createdAt,
      ...(attemptedEntry.status === undefined ? {} : { status: attemptedEntry.status }),
    }

    if (session === null) {
      await db.insert('harnessSessions', {
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
      await db.patch(session._id, sessionPatch)
    }

    return {
      status: 'accepted' as const,
      entry: toEntryReceipt(attemptedEntry),
      activeLeafEntryId: attemptedEntry.entryId,
    }
  },
})

export const listHarnessSessionEntries = queryGeneric({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: listHarnessSessionEntriesResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const limit = normalizeLimit(args.limit)
    const [session, rows] = await Promise.all([
      db
        .query('harnessSessions')
        .withIndex('by_sessionId', (query) => query.eq('sessionId', args.sessionId))
        .unique(),
      orderedQuery(
        db.query('harnessSessionEntries').withIndex('by_sessionId_seq', (query) => query.eq('sessionId', args.sessionId))
      )
        .order('desc')
        .take(limit),
    ])

    return {
      kind: 'ok' as const,
      session: session === null ? null : toPublicSessionSummary(session),
      entries: rows.map(toPublicEntry).sort(comparePublicEntries),
      limit,
      truncated: session !== null && numberField(session, 'entryCount') > rows.length,
    }
  },
})

export const listHarnessRunEntries = queryGeneric({
  args: {
    runId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: listHarnessRunEntriesResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const limit = normalizeLimit(args.limit)
    const rows = await orderedQuery(
      db.query('harnessSessionEntries').withIndex('by_runId_seq', (query) => query.eq('runId', args.runId))
    )
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

export const readAdminHarnessSessionEntries = queryGeneric({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: readAdminHarnessSessionEntriesResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const limit = normalizeLimit(args.limit)
    const authority = await resolveAdminAuthority({ db, auth: ctx.auth }, 'read_admin_readbacks')
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
      db
        .query('harnessSessions')
        .withIndex('by_sessionId', (query) => query.eq('sessionId', args.sessionId))
        .unique(),
      orderedQuery(
        db.query('harnessSessionEntries').withIndex('by_sessionId_seq', (query) => query.eq('sessionId', args.sessionId))
      )
        .order('desc')
        .take(limit),
    ])

    return {
      kind: 'allowed' as const,
      session: session === null ? null : toSessionSummary(session),
      entries: rows.map(toPrivateEntry).sort(comparePrivateEntries),
      limit,
      truncated: session !== null && numberField(session, 'entryCount') > rows.length,
    }
  },
})

function orderedQuery(query: RuntimeQuery): OrderedRuntimeQuery {
  return query as OrderedRuntimeQuery
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

function toSessionSummary(row: RuntimeDocument): {
  sessionId: string
  ownerKey: string
  entryCount: number
  activeLeafEntryId?: string
  lastRunId?: string
  status?: HarnessRunStatus
  createdAt: number
  updatedAt: number
} {
  const activeLeafEntryId = optionalStringField(row, 'activeLeafEntryId')
  const lastRunId = optionalStringField(row, 'lastRunId')
  const status = harnessStatusField(row)
  return {
    sessionId: stringField(row, 'sessionId'),
    ownerKey: stringField(row, 'ownerKey'),
    entryCount: numberField(row, 'entryCount'),
    ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
    ...(lastRunId === undefined ? {} : { lastRunId }),
    ...(status === undefined ? {} : { status }),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toPublicSessionSummary(row: RuntimeDocument): {
  sessionId: string
  entryCount: number
  status?: HarnessRunStatus
  createdAt: number
  updatedAt: number
} {
  const status = harnessStatusField(row)
  return {
    sessionId: stringField(row, 'sessionId'),
    entryCount: numberField(row, 'entryCount'),
    ...(status === undefined ? {} : { status }),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toEntryReceipt(row: RuntimeDocument | (HarnessSessionEntry & { ownerKey?: string })): {
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
  const turnId = optionalStringField(row, 'turnId')
  const parentEntryId = optionalStringField(row, 'parentEntryId')
  const status = harnessStatusField(row)
  return {
    entryId: stringField(row, 'entryId'),
    sessionId: stringField(row, 'sessionId'),
    runId: stringField(row, 'runId'),
    ...(turnId === undefined ? {} : { turnId }),
    seq: numberField(row, 'seq'),
    ...(parentEntryId === undefined ? {} : { parentEntryId }),
    kind: harnessKindField(row),
    ...(status === undefined ? {} : { status }),
    idempotencyKey: stringField(row, 'idempotencyKey'),
    createdAt: numberField(row, 'createdAt'),
  }
}

function toPrivateEntry(row: RuntimeDocument): {
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
  const publicSummaryJson = optionalStringField(row, 'publicSummaryJson')
  const privatePayloadJson = optionalStringField(row, 'privatePayloadJson')
  const toolContractHash = optionalStringField(row, 'toolContractHash')
  const sourceSnapshotHash = optionalStringField(row, 'sourceSnapshotHash')
  return {
    ...receipt,
    ownerKey: stringField(row, 'ownerKey'),
    requestHash: stringField(row, 'requestHash'),
    payloadJson: stringField(row, 'payloadJson'),
    ...(publicSummaryJson === undefined ? {} : { publicSummaryJson }),
    ...(privatePayloadJson === undefined ? {} : { privatePayloadJson }),
    schemaVersion: numberField(row, 'schemaVersion'),
    ...(toolContractHash === undefined ? {} : { toolContractHash }),
    ...(sourceSnapshotHash === undefined ? {} : { sourceSnapshotHash }),
  }
}

function toPublicEntry(row: RuntimeDocument): {
  seq: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  createdAt: number
  publicSummaryJson?: string
} {
  const status = harnessStatusField(row)
  const publicSummaryJson = optionalStringField(row, 'publicSummaryJson')
  return {
    seq: numberField(row, 'seq'),
    kind: harnessKindField(row),
    ...(status === undefined ? {} : { status }),
    createdAt: numberField(row, 'createdAt'),
    ...(publicSummaryJson === undefined ? {} : { publicSummaryJson }),
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

function stringField(row: Record<string, unknown>, field: string): string {
  const value = row[field]
  return typeof value === 'string' ? value : ''
}

function optionalStringField(row: Record<string, unknown>, field: string): string | undefined {
  const value = row[field]
  return typeof value === 'string' ? value : undefined
}

function numberField(row: Record<string, unknown>, field: string): number {
  const value = row[field]
  return typeof value === 'number' ? value : 0
}

function harnessKindValue(value: unknown): HarnessSessionEntryKind {
  return HarnessSessionEntryKindValues.includes(value as HarnessSessionEntryKind)
    ? value as HarnessSessionEntryKind
    : 'turn.started'
}

function harnessStatusValue(value: unknown): HarnessRunStatus | undefined {
  return HarnessRunStatusValues.includes(value as HarnessRunStatus) ? value as HarnessRunStatus : undefined
}

function harnessKindField(row: Record<string, unknown>): HarnessSessionEntryKind {
  return harnessKindValue(stringField(row, 'kind'))
}

function harnessStatusField(row: Record<string, unknown>): HarnessRunStatus | undefined {
  return harnessStatusValue(optionalStringField(row, 'status'))
}
