import { describe, expect, it } from 'vitest'

import type { AnswerTurnRecord, FrozenTurnEvidence, FrozenTurnProse } from '@/modules/answer-thread/public'
import type { AnswerSource } from '@/modules/answer/answer-synthesizer'
import { buildHarnessRunReport } from '@/modules/harness/public'
import {
  buildHarnessRunViewerDetailProjection,
  buildHarnessRunViewerListResult,
} from '@/modules/harness/internal/run-viewer-projection'

describe('harness run viewer projection', () => {
  it('parses legacy turns with and without harnessRun evidence', () => {
    const withHarnessRun = answerTurn('turn-with-harness', {
      evidence: {
        harnessRun: buildHarnessRunReport({
          availableTools: ['registry.search', 'registry.detail'],
          tools: [{ toolId: 'registry.search', status: 'ok', durationMs: 8 }],
          snapshot: {
            runId: 'run-harness-1',
            sessionId: 'session-private-1',
            startedAt: 100,
            endedAt: 112,
          },
        }),
      },
    })
    const withoutHarnessRun = answerTurn('turn-legacy', {
      evidence: {
        toolCalls: [
          {
            toolCallId: 'tool-call-legacy',
            turnId: 'turn-legacy',
            seq: 0,
            toolId: 'registry.search',
            inputJson: JSON.stringify({ query: 'plumber preston' }),
            resultSummaryJson: JSON.stringify({ count: 1, slugs: ['preston-plumbing'] }),
            resultHash: 'result-hash-legacy',
            status: 'complete',
            createdAt: 1_000,
          },
        ],
        timings: [
          {
            name: 'tool.run',
            durationMs: 13,
            atMs: 1_000,
            metadata: { toolId: 'registry.search', toolSeq: 0 },
          },
        ],
      },
    })

    const result = buildHarnessRunViewerListResult({
      access: { kind: 'allowed', actorRef: 'admin@example.test' },
      turns: [withHarnessRun, withoutHarnessRun],
      generatedAt: 2_000,
    })

    expect(result.kind).toBe('allowed')
    if (result.kind !== 'allowed') {
      throw new Error('Expected allowed run viewer result.')
    }
    expect(result.summary).toMatchObject({
      turns: 2,
      withHarnessRun: 1,
      legacyBackfilled: 1,
      missingRunEvidence: 0,
    })
    expect(result.rows.map((row) => [row.turnId, row.runSource, row.runStatus])).toEqual([
      ['turn-legacy', 'legacyAnswerRun', 'ok'],
      ['turn-with-harness', 'harnessRun', 'ok'],
    ])

    const detail = buildHarnessRunViewerDetailProjection({
      actorRef: 'admin@example.test',
      turns: [withHarnessRun, withoutHarnessRun],
      turnId: 'turn-legacy',
      generatedAt: 2_000,
    })
    expect(detail.kind).toBe('allowed')
    if (detail.kind !== 'allowed') {
      throw new Error('Expected allowed detail projection.')
    }
    expect(detail.detail.run.source).toBe('legacyAnswerRun')
    expect(detail.detail.tools).toHaveLength(1)
    expect(detail.detail.tools[0]).toMatchObject({
      toolId: 'registry.search',
      status: 'complete',
      durationMs: 13,
      resultHash: 'result-hash-legacy',
    })
  })

  it('returns no private rows when access is denied', () => {
    const privateTurn = answerTurn('turn-private', {
      query: 'private raw-token-denied query',
      evidence: {
        toolCalls: [
          {
            toolCallId: 'tool-call-secret',
            turnId: 'turn-private',
            seq: 0,
            toolId: 'registry.detail',
            inputJson: JSON.stringify({ slug: 'raw-token-denied' }),
            resultSummaryJson: JSON.stringify({ count: 1, slugs: ['raw-token-denied'] }),
            resultHash: 'raw-token-denied-result',
            status: 'complete',
            createdAt: 1_000,
          },
        ],
      },
    })

    const result = buildHarnessRunViewerListResult({
      access: { kind: 'denied', reason: 'missing_membership' },
      turns: [privateTurn],
      generatedAt: 3_000,
    })

    expect(result).toMatchObject({
      kind: 'denied',
      httpStatus: 401,
      rows: [],
    })
    expect(JSON.stringify(result)).not.toContain('raw-token-denied')
    expect(JSON.stringify(result)).not.toContain('tool-call-secret')
  })

  it('keeps raw tokens out of the public projection diff', () => {
    const turn = answerTurn('turn-public-diff', {
      evidence: {
        toolCalls: [
          {
            toolCallId: 'tool-call-raw-token',
            turnId: 'turn-public-diff',
            seq: 0,
            toolId: 'registry.search',
            inputJson: JSON.stringify({ query: 'plumber preston', token: 'raw-token-private-input' }),
            resultSummaryJson: JSON.stringify({ count: 1, slugs: ['preston-plumbing'] }),
            resultHash: 'raw-token-private-result-hash',
            status: 'complete',
            createdAt: 1_000,
          },
        ],
        harnessRun: buildHarnessRunReport({
          tools: [{ toolId: 'registry.search', status: 'ok', durationMs: 9 }],
          models: [
            {
              provider: 'openrouter',
              model: 'model-a',
              status: 'ok',
              durationMs: 20,
              requestId: 'raw-token-provider-request',
              responseId: 'raw-token-provider-response',
            },
          ],
          snapshot: {
            runId: 'raw-token-run-id',
            sessionId: 'raw-token-session-id',
          },
        }),
      },
    })

    const detail = buildHarnessRunViewerDetailProjection({
      actorRef: 'admin@example.test',
      turns: [turn],
      turnId: turn.turnId,
      generatedAt: 4_000,
    })

    expect(detail.kind).toBe('allowed')
    if (detail.kind !== 'allowed') {
      throw new Error('Expected allowed detail projection.')
    }
    const diff = detail.detail.publicProjection
    expect(diff.leakedMarkers).toEqual([])
    expect(diff.excludedPrivateMarkers).toEqual(
      expect.arrayContaining(['harnessRun', 'toolCalls', 'toolCallId', 'inputJson', 'resultHash', 'requestId', 'responseId']),
    )
    expect(diff.serializedPublicProjection).not.toMatch(/raw-token|harnessRun|toolCalls|inputJson|resultHash|registry\.search/)
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
  const evidence: FrozenTurnEvidence = {
    providers: [answerSource()],
    allowedSlugs: ['preston-plumbing'],
    agentJsonUrl: '/api/businesses/search?q=plumber',
    ...options.evidence,
  }
  const prose: FrozenTurnProse = {
    oneLine: 'One listed business matches.',
    summary: 'The business handles timing, price, and availability.',
    nextStep: 'Open the provider page.',
    ...options.prose,
  }

  return {
    turnId,
    threadId: 'thread-run-viewer',
    seq: turnId.endsWith('legacy') ? 2 : 1,
    query: options.query ?? 'plumber Preston',
    intent: 'refine_search',
    evidenceJson: JSON.stringify(evidence),
    snapshotHash: `snapshot-${turnId}`,
    proseJson: JSON.stringify(prose),
    artifactKindsJson: JSON.stringify(['one-line', 'provider-cards']),
    status: 'complete',
    createdAt: turnId.endsWith('legacy') ? 2_000 : 1_000,
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
