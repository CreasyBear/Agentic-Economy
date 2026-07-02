import { describe, expect, it } from 'vitest'

import {
  appendHarnessSessionEntry,
  appendHarnessSessionEntryWithResult,
  buildHarnessSessionProjection,
  HarnessSessionJournalConflictError,
} from '@/modules/harness/public'
import type { HarnessSessionEntry, HarnessSessionEntryInput } from '@/modules/harness/public'

describe('harness session journal', () => {
  it('appends immutable entries in session-local seq order and advances the active leaf', () => {
    let entries: readonly HarnessSessionEntry[] = []

    const first = appendHarnessSessionEntryWithResult(entries, journalInput({
      entryId: 'entry-1',
      runId: 'run-1',
      kind: 'turn.started',
      createdAt: 10,
      payload: { query: 'plumber' },
    }))

    expect(first.status).toBe('accepted')
    if (first.status !== 'accepted') throw new Error('expected accepted append')
    entries = first.entries

    const second = appendHarnessSessionEntryWithResult(entries, journalInput({
      entryId: 'entry-2',
      runId: 'run-1',
      kind: 'tool.completed',
      status: 'ok',
      createdAt: 20,
      payload: { tool: 'catalog-search' },
      publicSummary: { kind: 'catalog-search', count: 2 },
    }))

    expect(second.status).toBe('accepted')
    if (second.status !== 'accepted') throw new Error('expected accepted append')
    entries = second.entries

    const otherSessionEntry = journalInput({
      entryId: 'entry-other',
      sessionId: 'session-2',
      runId: 'run-x',
      kind: 'turn.started',
      createdAt: 5,
    })
    entries = appendHarnessSessionEntry(entries, otherSessionEntry)

    const projection = buildHarnessSessionProjection('session-1', entries)

    expect(entries).toHaveLength(3)
    expect(projection.entries.map((entry) => entry.entryId)).toEqual(['entry-1', 'entry-2'])
    expect(projection.entries.map((entry) => entry.seq)).toEqual([1, 2])
    expect(projection.activeLeafEntryId).toBe('entry-2')
    expect(projection.replayPath.map((entry) => entry.entryId)).toEqual(['entry-1', 'entry-2'])
    expect(projection.childrenByParentEntryId['entry-1']?.map((entry) => entry.entryId)).toEqual(['entry-2'])
    expect(projection.runIds).toEqual(['run-1'])
    expect(projection.latestByRunId['run-1']?.entryId).toBe('entry-2')
  })

  it('replays duplicate idempotency keys when the request hash matches', () => {
    const original = journalInput({
      entryId: 'entry-1',
      runId: 'run-1',
      kind: 'turn.started',
      idempotencyKey: 'turn-1:start',
      createdAt: 10,
      payload: { query: 'electrician' },
    })
    const first = appendHarnessSessionEntryWithResult([], original)

    expect(first.status).toBe('accepted')
    if (first.status !== 'accepted') throw new Error('expected accepted append')

    const replay = appendHarnessSessionEntryWithResult(first.entries, {
      ...original,
      entryId: 'entry-retry',
      createdAt: 11,
    })

    expect(replay.status).toBe('replayed')
    if (replay.status !== 'replayed') throw new Error('expected replayed append')
    expect(replay.entries).toBe(first.entries)
    expect(replay.entry.entryId).toBe('entry-1')
    expect(replay.activeLeafEntryId).toBe('entry-1')
  })

  it('returns an idempotency conflict for duplicate keys with different request hashes', () => {
    const original = journalInput({
      entryId: 'entry-1',
      runId: 'run-1',
      kind: 'turn.started',
      idempotencyKey: 'turn-1:start',
      createdAt: 10,
      payload: { query: 'plumber' },
    })
    const first = appendHarnessSessionEntryWithResult([], original)

    expect(first.status).toBe('accepted')
    if (first.status !== 'accepted') throw new Error('expected accepted append')

    const conflict = appendHarnessSessionEntryWithResult(first.entries, {
      ...original,
      entryId: 'entry-conflict',
      payload: { query: 'locksmith' },
    })

    expect(conflict.status).toBe('conflict')
    if (conflict.status !== 'conflict') throw new Error('expected conflict append')
    expect(conflict.reason).toBe('idempotency_conflict')
    expect(conflict.entries).toBe(first.entries)
    expect(conflict.existingEntry?.entryId).toBe('entry-1')
  })

  it('rejects stale parents without advancing the active leaf', () => {
    let entries: readonly HarnessSessionEntry[] = []
    const first = appendHarnessSessionEntryWithResult(entries, journalInput({
      entryId: 'entry-1',
      runId: 'run-1',
      kind: 'turn.started',
      createdAt: 10,
    }))

    expect(first.status).toBe('accepted')
    if (first.status !== 'accepted') throw new Error('expected accepted append')
    entries = first.entries

    const second = appendHarnessSessionEntryWithResult(entries, journalInput({
      entryId: 'entry-2',
      runId: 'run-1',
      kind: 'context.loaded',
      createdAt: 20,
    }))

    expect(second.status).toBe('accepted')
    if (second.status !== 'accepted') throw new Error('expected accepted append')
    entries = second.entries

    const conflict = appendHarnessSessionEntryWithResult(entries, journalInput({
      entryId: 'entry-3',
      runId: 'run-2',
      kind: 'turn.started',
      parentEntryId: 'entry-1',
      createdAt: 30,
    }))

    expect(conflict.status).toBe('conflict')
    if (conflict.status !== 'conflict') throw new Error('expected conflict append')
    expect(conflict.reason).toBe('parent_conflict')
    expect(conflict.activeLeafEntryId).toBe('entry-2')
    expect(buildHarnessSessionProjection('session-1', conflict.entries).activeLeafEntryId).toBe('entry-2')
    expect(conflict.entries.map((entry) => entry.entryId)).toEqual(['entry-1', 'entry-2'])
  })

  it('throws a typed conflict error from the convenience append helper', () => {
    let entries: readonly HarnessSessionEntry[] = []
    entries = appendHarnessSessionEntry(entries, journalInput({
      entryId: 'entry-1',
      runId: 'run-1',
      kind: 'turn.started',
      createdAt: 10,
    }))
    entries = appendHarnessSessionEntry(entries, journalInput({
      entryId: 'entry-2',
      runId: 'run-1',
      kind: 'context.loaded',
      createdAt: 20,
    }))

    expect(() => appendHarnessSessionEntry(entries, journalInput({
      entryId: 'entry-3',
      runId: 'run-1',
      kind: 'tool.started',
      parentEntryId: 'entry-1',
      createdAt: 30,
    }))).toThrow(HarnessSessionJournalConflictError)
  })
})

function journalInput(input: Partial<HarnessSessionEntryInput> & {
  entryId: string
  runId: string
  kind: HarnessSessionEntryInput['kind']
  createdAt: number
}): HarnessSessionEntryInput {
  return {
    sessionId: 'session-1',
    payload: {},
    ...input,
  }
}
