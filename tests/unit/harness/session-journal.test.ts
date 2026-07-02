import { describe, expect, it } from 'vitest'

import {
  appendHarnessSessionEntry,
  buildHarnessSessionProjection,
  createHarnessSessionEntry,
} from '@/modules/harness/public'
import type { HarnessSessionEntry } from '@/modules/harness/public'

describe('harness session journal', () => {
  it('appends immutable entries and projects replay order per session', () => {
    let entries: readonly HarnessSessionEntry[] = []
    entries = appendHarnessSessionEntry(entries, {
      entryId: 'entry-2',
      sessionId: 'session-1',
      runId: 'run-1',
      kind: 'tool.completed',
      createdAt: 20,
      payload: { toolId: 'registry.search' },
    })
    entries = appendHarnessSessionEntry(entries, {
      entryId: 'entry-1',
      sessionId: 'session-1',
      runId: 'run-1',
      seq: 1,
      kind: 'turn.started',
      createdAt: 10,
      payload: { query: 'plumber' },
    })
    entries = appendHarnessSessionEntry(entries, {
      entryId: 'entry-other',
      sessionId: 'session-2',
      runId: 'run-x',
      kind: 'turn.started',
      createdAt: 5,
      payload: {},
    })
    entries = appendHarnessSessionEntry(entries, createHarnessSessionEntry({
      entryId: 'entry-3',
      sessionId: 'session-1',
      runId: 'run-2',
      seq: 3,
      kind: 'turn.completed',
      createdAt: 30,
      parentEntryId: 'entry-2',
      payload: { status: 'ok' },
    }))

    const projection = buildHarnessSessionProjection('session-1', entries)

    expect(entries).toHaveLength(4)
    expect(projection.entries.map((entry) => entry.entryId)).toEqual(['entry-1', 'entry-2', 'entry-3'])
    expect(projection.runIds).toEqual(['run-1', 'run-2'])
    expect(projection.latestByRunId['run-1']?.entryId).toBe('entry-2')
    expect(projection.latestByRunId['run-2']?.entryId).toBe('entry-3')
  })
})
