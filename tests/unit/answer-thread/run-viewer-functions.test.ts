import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerTurnRecord } from '@/modules/answer-thread/answer-thread.schema'
import type { FrozenTurnEvidence, FrozenTurnEvidenceDraft, FrozenTurnProse } from '@/modules/answer-thread/harness'
import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type { AnswerSource } from '@/modules/answer/answer-synthesizer'
import {
  accessForHarnessRunViewerAdminMembership,
  readAdminRunViewerDetailThroughSource,
  readAdminRunViewerListThroughSource,
  setHarnessRunViewerSourcePortForTests,
} from '@/modules/answer-thread/run-viewer.functions'

let restoreSourcePort: (() => void) | undefined

afterEach(() => {
  restoreSourcePort?.()
  restoreSourcePort = undefined
})

describe('harness run viewer source seam', () => {
  it('denies private source reads when no authenticated admin source is available', async () => {
    const result = await readAdminRunViewerListThroughSource({
      status: 'any',
      turnId: '  turn-private  ',
      hasRunEvidence: 'any',
    })

    expect(result).toMatchObject({
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      filters: { turnId: 'turn-private' },
      rows: [],
    })
    expect(JSON.stringify(result)).not.toContain('source_read_not_configured')
  })

  it('does not expose private detail rows when the default source read is denied', async () => {
    const result = await readAdminRunViewerDetailThroughSource('turn-disabled')

    expect(result).toMatchObject({
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      rows: [],
    })
    expect(JSON.stringify(result)).not.toContain('source_read_not_configured')
    expect(JSON.stringify(result)).not.toContain('raw-token-private')
  })

  it('uses a configured source port for allowed admin reads', async () => {
    let readActorRef: string | undefined
    restoreSourcePort = setHarnessRunViewerSourcePortForTests({
      authorize: async () => ({ kind: 'allowed', actorRef: 'admin@example.test' }),
      readTurns: async (filters, access) => {
        readActorRef = access.actorRef
        return [
          answerTurn('turn-allowed-source', { query: filters.turnId ?? 'source query' }),
        ]
      },
    })

    const result = await readAdminRunViewerListThroughSource({ turnId: 'turn-allowed' })

    expect(result.kind).toBe('allowed')
    if (result.kind !== 'allowed') {
      throw new Error('Expected allowed source read.')
    }

    expect(result.actorRef).toBe('admin@example.test')
    expect(readActorRef).toBe('admin@example.test')
    expect(result.source).toEqual({ kind: 'configured' })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      turnId: 'turn-allowed-source',
      threadId: 'thread-run-viewer-functions',
    })
  })

  it('does not read private turns when a configured source port denies admin access', async () => {
    let readCalls = 0
    restoreSourcePort = setHarnessRunViewerSourcePortForTests({
      authorize: async () => ({ kind: 'denied', reason: 'missing_membership' }),
      readTurns: async () => {
        readCalls += 1
        return [
          answerTurn('turn-denied-source', {
            query: 'private raw-token-private query',
            evidence: {
              toolCalls: [
                {
                  toolCallId: 'tool-call-raw-token-private',
                  turnId: 'turn-denied-source',
                  seq: 0,
                  toolId: 'registry.detail',
                  inputJson: JSON.stringify({ slug: 'raw-token-private' }),
                  resultSummaryJson: JSON.stringify({ count: 1, slugs: ['raw-token-private'] }),
                  resultJson: JSON.stringify({ kind: 'ok', items: [{ slug: 'raw-token-private' }] }),
                  resultHash: 'raw-token-private-result',
                  status: 'complete',
                  createdAt: 1_000,
                },
              ],
            },
          }),
        ]
      },
    })

    const result = await readAdminRunViewerListThroughSource()

    expect(readCalls).toBe(0)
    expect(result).toMatchObject({
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      rows: [],
    })
    expect(JSON.stringify(result)).not.toContain('raw-token-private')
    expect(JSON.stringify(result)).not.toContain('tool-call-raw-token-private')
  })

  it('derives run viewer access from the shared admin authority matrix', () => {
    expect(accessForHarnessRunViewerAdminMembership(undefined)).toMatchObject({
      kind: 'denied',
      reason: 'missing_membership',
    })
    expect(
      accessForHarnessRunViewerAdminMembership({
        clerkUserId: 'reviewer@example.test',
        tokenIdentifier: 'clerk|reviewer@example.test',
        role: 'reviewer',
        state: 'active',
        grantedBy: 'owner@example.test',
        grantedAt: 1_000,
      }),
    ).toEqual({ kind: 'allowed', actorRef: 'reviewer@example.test' })
    expect(
      accessForHarnessRunViewerAdminMembership({
        clerkUserId: 'suspended@example.test',
        tokenIdentifier: 'clerk|suspended@example.test',
        role: 'support',
        state: 'suspended',
        grantedBy: 'owner@example.test',
        grantedAt: 1_000,
      }),
    ).toMatchObject({
      kind: 'denied',
      reason: 'inactive_membership',
    })
  })
})

function answerTurn(
  turnId: string,
  options: {
    query?: string
    evidence?: Partial<FrozenTurnEvidence>
    prose?: Partial<FrozenTurnProse>
  } = {},
): AnswerTurnRecord {
  const evidenceDraft: FrozenTurnEvidenceDraft = {
    providers: [answerSource()],
    allowedSlugs: ['preston-plumbing'],
    agentJsonUrl: '/api/businesses/search?q=plumber',
    toolCalls: [],
    timings: [],
    workLog: [],
    ...options.evidence,
  }
  const evidence: FrozenTurnEvidence = {
    ...evidenceDraft,
    answerRun: buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash: `snapshot-${turnId}`,
      evidence: evidenceDraft,
    }),
  }
  const prose: FrozenTurnProse = {
    oneLine: 'One listed business matches.',
    summary: 'The business handles timing, price, and availability.',
    nextStep: 'Open the provider page.',
    ...options.prose,
  }

  return {
    turnId,
    threadId: 'thread-run-viewer-functions',
    seq: 1,
    query: options.query ?? 'plumber Preston',
    intent: 'refine_search',
    evidenceJson: JSON.stringify(evidence),
    snapshotHash: `snapshot-${turnId}`,
    proseJson: JSON.stringify(prose),
    artifactKindsJson: JSON.stringify(['one-line', 'provider-cards']),
    status: 'complete',
    createdAt: 1_000,
  }
}

function answerSource(): AnswerSource {
  return {
    citationIndex: 1,
    slug: 'preston-plumbing',
    name: 'Preston Plumbing',
    category: 'Plumber',
    suburb: 'Preston',
    stateTerritory: 'VIC',
    serviceArea: 'Preston',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: '',
    trustCue: 'Checked',
    nextStepLabel: 'View details',
    detailUrl: '/preston-plumbing',
    services: [],
  }
}
