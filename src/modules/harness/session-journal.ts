import type {
  HarnessSessionEntry,
  HarnessSessionEntryKind,
  HarnessSessionProjection,
} from './harness.schema'

export function appendHarnessSessionEntry(
  entries: readonly HarnessSessionEntry[],
  entry: Omit<HarnessSessionEntry, 'seq'> & { seq?: number },
): readonly HarnessSessionEntry[] {
  const nextSeq = entry.seq ?? nextEntrySeq(entries)
  return [
    ...entries,
    {
      ...entry,
      seq: nextSeq,
    },
  ]
}

export function buildHarnessSessionProjection(
  sessionId: string,
  entries: readonly HarnessSessionEntry[],
): HarnessSessionProjection {
  const sessionEntries = entries
    .filter((entry) => entry.sessionId === sessionId)
    .sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt || a.entryId.localeCompare(b.entryId))
  const latestByRunId: Record<string, HarnessSessionEntry> = {}

  for (const entry of sessionEntries) {
    latestByRunId[entry.runId] = entry
  }

  return {
    sessionId,
    entries: sessionEntries,
    runIds: stableUnique(sessionEntries.map((entry) => entry.runId)),
    latestByRunId,
  }
}

export function createHarnessSessionEntry(input: {
  entryId: string
  sessionId: string
  runId: string
  seq: number
  kind: HarnessSessionEntryKind
  createdAt: number
  parentEntryId?: string
  payload?: Record<string, unknown>
}): HarnessSessionEntry {
  return {
    entryId: input.entryId,
    sessionId: input.sessionId,
    runId: input.runId,
    seq: input.seq,
    kind: input.kind,
    createdAt: input.createdAt,
    ...(input.parentEntryId === undefined ? {} : { parentEntryId: input.parentEntryId }),
    payload: input.payload ?? {},
  }
}

function nextEntrySeq(entries: readonly HarnessSessionEntry[]): number {
  return entries.reduce((maxSeq, entry) => Math.max(maxSeq, entry.seq), 0) + 1
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}
