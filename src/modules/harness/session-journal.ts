import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableUnique } from '@/modules/common/stable-unique'
import { safeJsonStringify } from '@/modules/common/safe-json-stringify'

import type {
  HarnessRunStatus,
  HarnessSessionEntry,
  HarnessSessionEntryKind,
  HarnessSessionProjection,
} from './harness.schema'

export type HarnessSessionEntryInput = {
  entryId: string
  sessionId: string
  runId: string
  turnId?: string
  seq?: number
  parentEntryId?: string
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey?: string
  requestHash?: string
  createdAt: number
  payload?: unknown
  payloadJson?: string
  publicSummary?: unknown
  publicSummaryJson?: string
  privatePayload?: unknown
  privatePayloadJson?: string
  schemaVersion?: number
  toolContractHash?: string
  sourceSnapshotHash?: string
}

export type HarnessSessionAppendConflictReason =
  | 'entry_id_conflict'
  | 'idempotency_conflict'
  | 'parent_conflict'

export type HarnessSessionAppendResult =
  | {
    status: 'accepted'
    entries: readonly HarnessSessionEntry[]
    entry: HarnessSessionEntry
    activeLeafEntryId: string
  }
  | {
    status: 'replayed'
    entries: readonly HarnessSessionEntry[]
    entry: HarnessSessionEntry
    activeLeafEntryId?: string
  }
  | {
    status: 'conflict'
    reason: HarnessSessionAppendConflictReason
    message: string
    entries: readonly HarnessSessionEntry[]
    activeLeafEntryId?: string
    existingEntry?: HarnessSessionEntry
    attemptedEntry?: HarnessSessionEntry
  }

export class HarnessSessionJournalConflictError extends Error {
  readonly reason: HarnessSessionAppendConflictReason
  readonly activeLeafEntryId: string | undefined
  readonly existingEntry: HarnessSessionEntry | undefined
  readonly attemptedEntry: HarnessSessionEntry | undefined

  constructor(result: Extract<HarnessSessionAppendResult, { status: 'conflict' }>) {
    super(result.message)
    this.name = 'HarnessSessionJournalConflictError'
    this.reason = result.reason
    this.activeLeafEntryId = result.activeLeafEntryId
    this.existingEntry = result.existingEntry
    this.attemptedEntry = result.attemptedEntry
  }
}

export function appendHarnessSessionEntry(
  entries: readonly HarnessSessionEntry[],
  entry: HarnessSessionEntryInput,
): readonly HarnessSessionEntry[] {
  const result = appendHarnessSessionEntryWithResult(entries, entry)
  if (result.status === 'conflict') {
    throw new HarnessSessionJournalConflictError(result)
  }
  return result.entries
}

export function appendHarnessSessionEntryWithResult(
  entries: readonly HarnessSessionEntry[],
  entryInput: HarnessSessionEntryInput,
): HarnessSessionAppendResult {
  const sessionProjection = buildHarnessSessionProjection(entryInput.sessionId, entries)
  const activeLeafEntryId = sessionProjection.activeLeafEntryId
  const idempotencyKey = entryInput.idempotencyKey ?? entryInput.entryId
  const duplicate = sessionProjection.entries.find((entry) => entry.idempotencyKey === idempotencyKey)

  if (duplicate !== undefined) {
    const replayAttempt = normalizeHarnessSessionEntry(entryInput, {
      parentEntryId: duplicate.parentEntryId,
      seq: duplicate.seq,
    })

    if (replayAttempt.requestHash === duplicate.requestHash) {
      return {
        status: 'replayed',
        entries,
        entry: duplicate,
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      }
    }

    return {
      status: 'conflict',
      reason: 'idempotency_conflict',
      message: `Idempotency key ${idempotencyKey} was already used with a different request hash.`,
      entries,
      ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      existingEntry: duplicate,
      attemptedEntry: replayAttempt,
    }
  }

  const parentEntryId = entryInput.parentEntryId ?? activeLeafEntryId
  const attemptedEntry = normalizeHarnessSessionEntry(entryInput, {
    parentEntryId,
    seq: entryInput.seq ?? nextEntrySeq(entries, entryInput.sessionId),
  })
  const existingByEntryId = sessionProjection.entriesById[attemptedEntry.entryId]

  if (existingByEntryId !== undefined) {
    return {
      status: 'conflict',
      reason: 'entry_id_conflict',
      message: `Entry id ${attemptedEntry.entryId} already exists in session ${entryInput.sessionId}.`,
      entries,
      ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      existingEntry: existingByEntryId,
      attemptedEntry,
    }
  }

  if (attemptedEntry.parentEntryId !== activeLeafEntryId) {
    return {
      status: 'conflict',
      reason: 'parent_conflict',
      message: `Parent ${attemptedEntry.parentEntryId ?? 'root'} does not match active leaf ${activeLeafEntryId ?? 'root'}.`,
      entries,
      ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      attemptedEntry,
    }
  }

  const nextEntries = [...entries, attemptedEntry]
  return {
    status: 'accepted',
    entries: nextEntries,
    entry: attemptedEntry,
    activeLeafEntryId: attemptedEntry.entryId,
  }
}

export function buildHarnessSessionProjection(
  sessionId: string,
  entries: readonly HarnessSessionEntry[],
): HarnessSessionProjection {
  const sessionEntries = entries
    .filter((entry) => entry.sessionId === sessionId)
    .sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt || a.entryId.localeCompare(b.entryId))
  const latestByRunId: Record<string, HarnessSessionEntry> = {}
  const entriesById: Record<string, HarnessSessionEntry> = {}
  const rootEntryIds: string[] = []
  const childrenByParentEntryId: Record<string, HarnessSessionEntry[]> = {}

  for (const entry of sessionEntries) {
    latestByRunId[entry.runId] = entry
    entriesById[entry.entryId] = entry
    if (entry.parentEntryId === undefined) {
      rootEntryIds.push(entry.entryId)
    } else {
      const children = childrenByParentEntryId[entry.parentEntryId] ?? []
      children.push(entry)
      childrenByParentEntryId[entry.parentEntryId] = children
    }
  }

  const activeLeafEntry = sessionEntries.at(-1)
  const replayPath = buildReplayPath(activeLeafEntry, entriesById)

  return {
    sessionId,
    entries: sessionEntries,
    runIds: stableUnique(sessionEntries.map((entry) => entry.runId)),
    latestByRunId,
    entriesById,
    rootEntryIds,
    childrenByParentEntryId,
    replayPath,
    ...(activeLeafEntry === undefined
      ? {}
      : {
        activeLeafEntryId: activeLeafEntry.entryId,
        activeLeafEntry,
      }),
  }
}

export function createHarnessSessionEntry(input: {
  entryId: string
  sessionId: string
  runId: string
  turnId?: string
  seq?: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  createdAt: number
  parentEntryId?: string
  idempotencyKey?: string
  requestHash?: string
  payload?: unknown
  payloadJson?: string
  publicSummary?: unknown
  publicSummaryJson?: string
  privatePayload?: unknown
  privatePayloadJson?: string
  schemaVersion?: number
  toolContractHash?: string
  sourceSnapshotHash?: string
}): HarnessSessionEntry {
  return normalizeHarnessSessionEntry(input, {
    parentEntryId: input.parentEntryId,
    seq: input.seq ?? 1,
  })
}

function normalizeHarnessSessionEntry(
  input: HarnessSessionEntryInput,
  defaults: { parentEntryId: string | undefined; seq: number },
): HarnessSessionEntry {
  const payloadJson = input.payloadJson ?? safeJsonStringify(input.payload ?? {})
  const publicSummaryJson = input.publicSummaryJson ?? (
    input.publicSummary === undefined ? undefined : safeJsonStringify(input.publicSummary)
  )
  const privatePayloadJson = input.privatePayloadJson ?? (
    input.privatePayload === undefined ? undefined : safeJsonStringify(input.privatePayload)
  )
  const schemaVersion = input.schemaVersion ?? 1
  const parentEntryId = input.parentEntryId ?? defaults.parentEntryId
  const idempotencyKey = input.idempotencyKey ?? input.entryId
  const requestHash = input.requestHash ?? buildHarnessSessionRequestHash({
    sessionId: input.sessionId,
    runId: input.runId,
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
    ...(parentEntryId === undefined ? {} : { parentEntryId }),
    kind: input.kind,
    ...(input.status === undefined ? {} : { status: input.status }),
    idempotencyKey,
    payloadJson,
    ...(publicSummaryJson === undefined ? {} : { publicSummaryJson }),
    ...(privatePayloadJson === undefined ? {} : { privatePayloadJson }),
    schemaVersion,
    ...(input.toolContractHash === undefined ? {} : { toolContractHash: input.toolContractHash }),
    ...(input.sourceSnapshotHash === undefined ? {} : { sourceSnapshotHash: input.sourceSnapshotHash }),
  })

  return {
    entryId: input.entryId,
    sessionId: input.sessionId,
    runId: input.runId,
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
    seq: input.seq ?? defaults.seq,
    kind: input.kind,
    ...(input.status === undefined ? {} : { status: input.status }),
    idempotencyKey,
    requestHash,
    createdAt: input.createdAt,
    ...(parentEntryId === undefined ? {} : { parentEntryId }),
    payloadJson,
    ...(publicSummaryJson === undefined ? {} : { publicSummaryJson }),
    ...(privatePayloadJson === undefined ? {} : { privatePayloadJson }),
    schemaVersion,
    ...(input.toolContractHash === undefined ? {} : { toolContractHash: input.toolContractHash }),
    ...(input.sourceSnapshotHash === undefined ? {} : { sourceSnapshotHash: input.sourceSnapshotHash }),
  }
}

function buildHarnessSessionRequestHash(input: {
  sessionId: string
  runId: string
  turnId?: string
  parentEntryId?: string
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey: string
  payloadJson: string
  publicSummaryJson?: string
  privatePayloadJson?: string
  schemaVersion: number
  toolContractHash?: string
  sourceSnapshotHash?: string
}): string {
  return canonicalDigest({
    sessionId: input.sessionId,
    runId: input.runId,
    turnId: input.turnId ?? null,
    parentEntryId: input.parentEntryId ?? null,
    kind: input.kind,
    status: input.status ?? null,
    idempotencyKey: input.idempotencyKey,
    payloadJson: input.payloadJson,
    publicSummaryJson: input.publicSummaryJson ?? null,
    privatePayloadJson: input.privatePayloadJson ?? null,
    schemaVersion: input.schemaVersion,
    toolContractHash: input.toolContractHash ?? null,
    sourceSnapshotHash: input.sourceSnapshotHash ?? null,
  }).toString()
}

function buildReplayPath(
  activeLeafEntry: HarnessSessionEntry | undefined,
  entriesById: Record<string, HarnessSessionEntry>,
): readonly HarnessSessionEntry[] {
  const path: HarnessSessionEntry[] = []
  const seen = new Set<string>()
  let cursor = activeLeafEntry

  while (cursor !== undefined && !seen.has(cursor.entryId)) {
    seen.add(cursor.entryId)
    path.push(cursor)
    cursor = cursor.parentEntryId === undefined ? undefined : entriesById[cursor.parentEntryId]
  }

  return path.reverse()
}

function nextEntrySeq(entries: readonly HarnessSessionEntry[], sessionId: string): number {
  return entries
    .filter((entry) => entry.sessionId === sessionId)
    .reduce((maxSeq, entry) => Math.max(maxSeq, entry.seq), 0) + 1
}

