import type {
  HarnessRunStatus,
  HarnessSessionEntry,
  HarnessSessionEntryKind,
} from './harness.schema'
import { buildHarnessSessionProjection } from './session-journal'

const TerminalSessionEntryKinds = new Set<HarnessSessionEntryKind>([
  'turn.completed',
  'turn.error',
  'run.reported',
  'replay.completed',
  'replay.failed',
])

export type HarnessReplayTerminal = {
  entryId: string
  seq: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  stale: boolean
}

export type HarnessPrivateReplayEntry = {
  entryId: string
  runId: string
  turnId?: string
  seq: number
  parentEntryId?: string
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  createdAt: number
  payload: unknown
  publicSummary?: unknown
  privatePayload?: unknown
}

export type HarnessPrivateReplayProjection = {
  sessionId: string
  activeLeafEntryId?: string
  entries: readonly HarnessPrivateReplayEntry[]
  terminal?: HarnessReplayTerminal
  staleTerminalEntryIds: readonly string[]
}

export type HarnessPublicReplayEntry = {
  seq: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  createdAt: number
  summary?: unknown
}

export type HarnessPublicReplayTerminal = {
  seq: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  stale: false
}

export type HarnessPublicReplayProjection = {
  sessionId: string
  activeLeafSeq?: number
  entries: readonly HarnessPublicReplayEntry[]
  terminal?: HarnessPublicReplayTerminal
  staleTerminalCount: number
}

export function buildHarnessReplayProjection(
  sessionId: string,
  entries: readonly HarnessSessionEntry[],
): HarnessPrivateReplayProjection {
  return buildHarnessPrivateReplayProjection(sessionId, entries)
}

export function buildHarnessPrivateReplayProjection(
  sessionId: string,
  entries: readonly HarnessSessionEntry[],
): HarnessPrivateReplayProjection {
  const projection = buildHarnessSessionProjection(sessionId, entries)
  const pathEntryIds = new Set(projection.replayPath.map((entry) => entry.entryId))
  const terminal = projection.activeLeafEntry === undefined || !isHarnessTerminalSessionEntry(projection.activeLeafEntry)
    ? undefined
    : buildTerminal(projection.activeLeafEntry, false)

  const staleTerminalEntryIds: string[] = []
  for (const entry of projection.entries) {
    if (isHarnessTerminalSessionEntry(entry) && !pathEntryIds.has(entry.entryId)) {
      staleTerminalEntryIds.push(entry.entryId)
    }
  }

  return {
    sessionId,
    ...(projection.activeLeafEntryId === undefined ? {} : { activeLeafEntryId: projection.activeLeafEntryId }),
    entries: projection.replayPath.map(toPrivateReplayEntry),
    ...(terminal === undefined ? {} : { terminal }),
    staleTerminalEntryIds,
  }
}

export function buildHarnessPublicReplayProjection(
  sessionId: string,
  entries: readonly HarnessSessionEntry[],
): HarnessPublicReplayProjection {
  const projection = buildHarnessSessionProjection(sessionId, entries)
  const pathEntryIds = new Set(projection.replayPath.map((entry) => entry.entryId))
  const terminal = projection.activeLeafEntry === undefined || !isHarnessTerminalSessionEntry(projection.activeLeafEntry)
    ? undefined
    : buildPublicTerminal(projection.activeLeafEntry)

  return {
    sessionId,
    ...(projection.activeLeafEntry === undefined ? {} : { activeLeafSeq: projection.activeLeafEntry.seq }),
    entries: projection.replayPath.map(toPublicReplayEntry),
    ...(terminal === undefined ? {} : { terminal }),
    staleTerminalCount: projection.entries
      .filter((entry) => isHarnessTerminalSessionEntry(entry) && !pathEntryIds.has(entry.entryId))
      .length,
  }
}

export function isHarnessTerminalSessionEntry(entry: HarnessSessionEntry): boolean {
  return TerminalSessionEntryKinds.has(entry.kind)
}

function toPrivateReplayEntry(entry: HarnessSessionEntry): HarnessPrivateReplayEntry {
  const publicSummary = entry.publicSummaryJson === undefined ? undefined : parseJson(entry.publicSummaryJson)
  const privatePayload = entry.privatePayloadJson === undefined ? undefined : parseJson(entry.privatePayloadJson)

  return {
    entryId: entry.entryId,
    runId: entry.runId,
    ...(entry.turnId === undefined ? {} : { turnId: entry.turnId }),
    seq: entry.seq,
    ...(entry.parentEntryId === undefined ? {} : { parentEntryId: entry.parentEntryId }),
    kind: entry.kind,
    ...(entry.status === undefined ? {} : { status: entry.status }),
    createdAt: entry.createdAt,
    payload: parseJson(entry.payloadJson),
    ...(publicSummary === undefined ? {} : { publicSummary }),
    ...(privatePayload === undefined ? {} : { privatePayload }),
  }
}

function toPublicReplayEntry(entry: HarnessSessionEntry): HarnessPublicReplayEntry {
  const summary = entry.publicSummaryJson === undefined ? undefined : parseJson(entry.publicSummaryJson)

  return {
    seq: entry.seq,
    kind: entry.kind,
    ...(entry.status === undefined ? {} : { status: entry.status }),
    createdAt: entry.createdAt,
    ...(summary === undefined ? {} : { summary }),
  }
}

function buildTerminal(entry: HarnessSessionEntry, stale: boolean): HarnessReplayTerminal {
  return {
    entryId: entry.entryId,
    seq: entry.seq,
    kind: entry.kind,
    ...(entry.status === undefined ? {} : { status: entry.status }),
    stale,
  }
}

function buildPublicTerminal(entry: HarnessSessionEntry): HarnessPublicReplayTerminal {
  return {
    seq: entry.seq,
    kind: entry.kind,
    ...(entry.status === undefined ? {} : { status: entry.status }),
    stale: false,
  }
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}
