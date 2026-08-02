import { describe, expect, it } from 'vitest'

import {
  buildHarnessPrivateReplayProjection,
  buildHarnessPublicReplayProjection,
  createHarnessSessionEntry,
} from '@/modules/harness/public'
import type { HarnessSessionEntry } from '@/modules/harness/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

describe('harness replay projection', () => {
  it('projects the active root-to-leaf path and marks off-path terminal entries stale', () => {
    const entries = branchedEntries()

    const projection = buildHarnessPrivateReplayProjection('session-1', entries)

    expect(projection.activeLeafEntryId).toBe('active-terminal')
    expect(projection.entries.map((entry) => entry.entryId)).toEqual(['root', 'branch', 'active-terminal'])
    expect(projection.terminal).toMatchObject({
      entryId: 'active-terminal',
      kind: 'turn.error',
      status: 'error',
      stale: false,
    })
    expect(projection.staleTerminalEntryIds).toEqual(['stale-terminal'])
  })

  it('keeps public projection rebuilt from summaries separate from private replay evidence', () => {
    const entries = branchedEntries()

    const privateProjection = buildHarnessPrivateReplayProjection('session-1', entries)
    const publicProjection = buildHarnessPublicReplayProjection('session-1', entries)
    const privateJson = JSON.stringify(privateProjection)
    const publicJson = JSON.stringify(publicProjection)

    expect(privateJson).toContain('registry.search')
    expect(privateJson).toContain('raw catalog dto')
    expect(publicProjection.activeLeafSeq).toBe(4)
    expect(publicProjection.entries.map((entry) => entry.seq)).toEqual([1, 3, 4])
    expect(publicProjection.terminal).toMatchObject({
      seq: 4,
      kind: 'turn.error',
      status: 'error',
      stale: false,
    })
    expect(publicProjection.staleTerminalCount).toBe(1)
    expect(publicJson).not.toContain('registry.search')
    expect(publicJson).not.toContain('inputJson')
    expect(publicJson).not.toContain('outputJson')
    expect(publicJson).not.toContain('resultHash')
    expect(publicJson).not.toContain('privatePayload')
    expect(publicJson).not.toContain('raw catalog dto')
  })
})

function branchedEntries(): readonly HarnessSessionEntry[] {
  return [
    createHarnessSessionEntry({
      entryId: 'root',
      sessionId: 'session-1',
      runId: 'run-1',
      seq: 1,
      kind: 'turn.started',
      createdAt: 10,
      payload: { query: 'plumber' },
      publicSummary: { kind: 'turn' },
    }),
    createHarnessSessionEntry({
      entryId: 'stale-terminal',
      sessionId: 'session-1',
      runId: 'run-1',
      seq: 2,
      parentEntryId: 'root',
      kind: 'turn.completed',
      status: 'ok',
      createdAt: 20,
      payload: {
        toolId: 'registry.search',
        inputJson: '{"q":"plumber"}',
        outputJson: '{"providers":["raw catalog dto"]}',
        resultHash: canonicalDigest('private'),
      },
      privatePayload: { providerEvidence: 'raw catalog dto' },
      publicSummary: { kind: 'catalog-search', count: 1 },
    }),
    createHarnessSessionEntry({
      entryId: 'branch',
      sessionId: 'session-1',
      runId: 'run-2',
      seq: 3,
      parentEntryId: 'root',
      kind: 'branch.created',
      createdAt: 30,
      payload: { reason: 'operator retry' },
      publicSummary: { kind: 'branch' },
    }),
    createHarnessSessionEntry({
      entryId: 'active-terminal',
      sessionId: 'session-1',
      runId: 'run-2',
      seq: 4,
      parentEntryId: 'branch',
      kind: 'turn.error',
      status: 'error',
      createdAt: 40,
      payload: {
        errorCode: 'model_failed',
        toolId: 'registry.search',
      },
      privatePayload: { providerEvidence: 'raw catalog dto' },
      publicSummary: { kind: 'error', code: 'model_failed' },
    }),
    createHarnessSessionEntry({
      entryId: 'other-session',
      sessionId: 'session-2',
      runId: 'run-x',
      seq: 1,
      kind: 'turn.completed',
      status: 'ok',
      createdAt: 5,
      payload: { should: 'be ignored' },
    }),
  ]
}
