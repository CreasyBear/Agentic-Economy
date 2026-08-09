import { describe, expect, it } from 'vitest'

import {
  initialAnswerTurnUiState,
  reduceAnswerTurnState,
  type AnswerTurnUiState,
} from '@/components/ae/chat/answer-turn-state'
import type { AnswerEvent, AnswerSource } from '@/modules/answer/public'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

const provider = (overrides: Partial<AnswerSource> = {}): AnswerSource => ({
  citationIndex: 1,
  slug: 'demo-plumber',
  name: 'Demo Plumber',
  category: 'Plumber',
  suburb: 'Parramatta',
  stateTerritory: 'NSW',
  serviceArea: 'Parramatta',
  hoursLabel: 'Hours supplied',
  availabilityLabel: 'Published',
  trustLabel: 'Checked',
  responseTimeLabel: '',
  trustCue: 'Checked',
  nextStepLabel: 'Send inquiry',
  detailUrl: '/demo-plumber',
  services: [],
  inquiryUrl: '/demo-plumber/inquiry',
  ...overrides,
})

function reduceEvent(state: AnswerTurnUiState, event: AnswerEvent): AnswerTurnUiState {
  return reduceAnswerTurnState(state, {
    type: 'frame',
    frame: { seq: state.lastFrameSeq + 1, event },
  })
}

describe('reduceAnswerTurnState', () => {
  it('keeps prior thinking labels in steps when the label advances', () => {
    const repeated = reduceEvent(initialAnswerTurnUiState, {
      type: 'thinking',
      label: 'Searching for matches…',
      step: 'search',
    })
    expect(repeated.thinkingSteps).toEqual([])

    const advanced = reduceEvent(repeated, {
      type: 'thinking',
      label: 'Reading the details',
      step: 'read',
    })
    expect(advanced.thinkingSteps).toEqual(['Searching for matches…'])
    expect(advanced.thinkingLabel).toBe('Reading the details')
  })

  it('turns semantic stream frames into visible answer artifacts', () => {
    const withOneLine = reduceEvent(initialAnswerTurnUiState, {
      type: 'one-line',
      oneLine: 'One match fits this need.',
    })
    const withSources = reduceEvent(withOneLine, {
      type: 'sources',
      providers: [provider()],
    })
    const withSummary = reduceEvent(withSources, {
      type: 'summary-delta',
      delta: 'Use the cards to compare published details.',
    })
    const complete = reduceEvent(withSummary, {
      type: 'next-step',
      nextStep: 'Open a provider page, then send an inquiry.',
    })

    expect(complete.artifacts.map((artifact) => artifact.kind)).toEqual([
      'one-line',
      'provider-cards',
      'prose',
      'what-to-do-now',
    ])
  })

  it('uses the plan budget before rendering streamed source cards', () => {
    const planned = reduceEvent(initialAnswerTurnUiState, {
      type: 'plan',
      mode: 'compare',
      layoutProfile: 'compare_pair',
      providerBudget: { searchLimit: 0, visibleLimit: 2 },
      artifactBudget: {
        layoutProfile: 'compare_pair',
        allowedKinds: ['one-line', 'provider-compare-table', 'prose', 'what-to-do-now'],
        maxArtifactCount: 4,
        maxProviderCards: 0,
      },
    } satisfies AnswerEvent)
    const withSources = reduceEvent(planned, {
      type: 'sources',
      providers: [provider(), provider({ citationIndex: 2, slug: 'other', name: 'Other Plumbing' })],
    })
    const withCompare = reduceEvent(withSources, {
      type: 'artifact',
      artifact: {
        kind: 'provider-compare-table',
        providers: [provider(), provider({ citationIndex: 2, slug: 'other', name: 'Other Plumbing' })],
      },
    })
    expect(withCompare.artifacts.map((artifact) => artifact.kind)).toEqual(['provider-compare-table'])
  })

  it('merges provider-card artifacts idempotently by kind', () => {
    const card = provider()
    const withCards = reduceEvent(initialAnswerTurnUiState, {
      type: 'artifact',
      artifact: { kind: 'provider-cards', providers: [card] },
    })
    const replaced = reduceEvent(withCards, {
      type: 'artifact',
      artifact: { kind: 'provider-cards', providers: [card] },
    })

    expect(replaced.artifacts).toHaveLength(1)
  })

  it('keeps SSE completion in settling until durable readback', () => {
    const streamed = reduceEvent(initialAnswerTurnUiState, {
      type: 'complete',
      answer: {
        query: 'plumber Preston',
        oneLine: 'Test',
        summary: 'Summary',
        nextStep: 'Next',
        providers: [],
        agentJsonUrl: '/api/businesses/search?q=test',
        layoutProfile: 'discovery_full',
      },
    })

    expect(streamed.phase).toBe('streaming')
    expect(streamed.complete).toBe(false)
    const settling = reduceAnswerTurnState(streamed, { type: 'stream_result', result: { kind: 'complete' } })
    expect(settling.phase).toBe('settling')

    const turn = {
      turnId: 'turn:1',
      seq: 1,
      query: 'plumber Preston',
      intent: 'refine_search',
      status: 'complete',
      workLog: [],
      artifacts: [],
      oneLine: 'Test',
    } satisfies PublicThreadTurn
    const durable = reduceAnswerTurnState(settling, { type: 'readback_turn', turn })
    expect(durable.phase).toBe('complete')
    expect(durable.complete).toBe(true)
  })

  it('keeps pending and stopped stream results out of complete', () => {
    const pending = reduceAnswerTurnState(initialAnswerTurnUiState, {
      type: 'stream_result',
      result: { kind: 'pending' },
    })
    expect(pending.phase).toBe('pending')
    expect(pending.complete).toBe(false)

    const stopped = reduceAnswerTurnState(initialAnswerTurnUiState, {
      type: 'stream_result',
      result: { kind: 'stopped' },
    })
    expect(stopped.phase).toBe('stopped')
    expect(stopped.stopState).toBe('accepted')
    expect(stopped.complete).toBe(false)
  })

  it('accepts the first server frame at sequence zero', () => {
    const first = reduceAnswerTurnState(initialAnswerTurnUiState, {
      type: 'frame',
      frame: { seq: 0, event: { type: 'one-line', oneLine: 'first' } },
    })
    const duplicate = reduceAnswerTurnState(first, {
      type: 'frame',
      frame: { seq: 0, event: { type: 'one-line', oneLine: 'duplicate' } },
    })

    expect(first.lastFrameSeq).toBe(0)
    expect(first.oneLineFallback).toBe('first')
    expect(duplicate).toBe(first)
  })

  it('drops duplicate and out-of-order frame sequences', () => {
    const first = reduceAnswerTurnState(initialAnswerTurnUiState, {
      type: 'frame',
      frame: { seq: 2, event: { type: 'one-line', oneLine: 'first' } },
    })
    const duplicate = reduceAnswerTurnState(first, {
      type: 'frame',
      frame: { seq: 2, event: { type: 'one-line', oneLine: 'duplicate' } },
    })
    const older = reduceAnswerTurnState(duplicate, {
      type: 'frame',
      frame: { seq: 1, event: { type: 'one-line', oneLine: 'older' } },
    })
    expect(older.oneLineFallback).toBe('first')
    expect(older.lastFrameSeq).toBe(2)
  })

  it('does not stop locally before a durable acknowledgement', () => {
    const requested = reduceAnswerTurnState(initialAnswerTurnUiState, { type: 'stop_requested' })
    expect(requested.phase).toBe('streaming')
    expect(requested.stopState).toBe('requested')
    const accepted = reduceAnswerTurnState(requested, { type: 'stop_accepted' })
    expect(accepted.phase).toBe('stopped')
    expect(accepted.stopState).toBe('accepted')
  })

  it('upserts work steps by stable id', () => {
    const running = reduceEvent(initialAnswerTurnUiState, {
      type: 'work-step',
      step: {
        id: 'search.registry.initial',
        phase: 'search',
        status: 'running',
        title: 'Searching for matches',
        startedAtMs: 10,
      },
    })
    const complete = reduceEvent(running, {
      type: 'work-step',
      step: {
        id: 'search.registry.initial',
        phase: 'search',
        status: 'complete',
        title: 'Searching for matches',
        summary: '1 match found.',
        detailRows: [{ label: 'Results', value: '1' }],
        startedAtMs: 10,
        completedAtMs: 20,
        durationMs: 10,
      },
    })

    expect(complete.workLog).toHaveLength(1)
    expect(complete.workLog[0]).toMatchObject({
      id: 'search.registry.initial',
      status: 'complete',
      summary: '1 match found.',
    })
    expect(complete.workLog[0]?.detailRows).toEqual([{ label: 'Results', value: '1' }])
  })

  it('marks running work steps as stopped when the user stops the stream', () => {
    const running = reduceEvent(initialAnswerTurnUiState, {
      type: 'work-step',
      step: {
        id: 'assemble.answer',
        phase: 'assemble',
        status: 'running',
        title: 'Putting together the answer',
        startedAtMs: Date.now() - 5,
      },
    })
    const stopped = reduceAnswerTurnState(running, { type: 'stop_accepted' })
    expect(stopped.workLog[0]?.status).toBe('stopped')
    expect(stopped.workLog[0]?.durationMs).toBeGreaterThanOrEqual(0)
  })
})
