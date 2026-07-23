import { describe, expect, it } from 'vitest'

import {
  initialAnswerTurnUiState,
  reduceAnswerTurnEvent,
  stopRunningWorkSteps,
} from '@/components/ae/chat/answer-turn-state'
import type { AnswerEvent, AnswerSource } from '@/modules/answer/public'

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

describe('reduceAnswerTurnEvent', () => {
  it('keeps prior thinking labels in steps when the label advances', () => {
    const repeated = reduceAnswerTurnEvent(initialAnswerTurnUiState, {
      type: 'thinking',
      label: 'Searching listed businesses…',
      step: 'search',
    })
    expect(repeated.thinkingSteps).toEqual([])

    const advanced = reduceAnswerTurnEvent(repeated, {
      type: 'thinking',
      label: 'Finding listed businesses',
      step: 'read',
    })

    expect(advanced.thinkingSteps).toEqual(['Searching listed businesses…'])
    expect(advanced.thinkingLabel).toBe('Finding listed businesses')
  })

  it('turns semantic stream frames into visible answer artifacts', () => {
    const withOneLine = reduceAnswerTurnEvent(initialAnswerTurnUiState, {
      type: 'one-line',
      oneLine: 'One listed business matches this need.',
    })
    const withSources = reduceAnswerTurnEvent(withOneLine, {
      type: 'sources',
      providers: [provider()],
    })
    const withSummary = reduceAnswerTurnEvent(withSources, {
      type: 'summary-delta',
      delta: 'Use the cards to compare published details.',
    })
    const complete = reduceAnswerTurnEvent(withSummary, {
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
    const planned = reduceAnswerTurnEvent(initialAnswerTurnUiState, {
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
    const withSources = reduceAnswerTurnEvent(planned, {
      type: 'sources',
      providers: [provider(), provider({ citationIndex: 2, slug: 'other', name: 'Other Plumbing' })],
    })
    const withCompare = reduceAnswerTurnEvent(withSources, {
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
    const withCards = reduceAnswerTurnEvent(initialAnswerTurnUiState, {
      type: 'artifact',
      artifact: { kind: 'provider-cards', providers: [card] },
    })
    const replaced = reduceAnswerTurnEvent(withCards, {
      type: 'artifact',
      artifact: { kind: 'provider-cards', providers: [card] },
    })

    expect(replaced.artifacts).toHaveLength(1)
  })

  it('merges Offering-v2 cards idempotently and caps them in source order', () => {
    const sources = [1, 2, 3, 4].map((citationIndex) => ({
      ...offeringSource(),
      citationIndex,
      business: {
        ...offeringSource().business,
        slug: `business-${citationIndex}`,
        name: `Business ${citationIndex}`,
      },
    }))
    const artifact = {
      kind: 'offering-cards',
      sources,
    } as unknown as AnswerEvent extends never ? never : Extract<AnswerEvent, { type: 'artifact' }>['artifact']
    const withCards = reduceAnswerTurnEvent(initialAnswerTurnUiState, {
      type: 'artifact',
      artifact,
    })
    const replaced = reduceAnswerTurnEvent(withCards, { type: 'artifact', artifact })
    const cards = replaced.artifacts.find((candidate) => candidate.kind === 'offering-cards')

    expect(replaced.artifacts.filter((candidate) => candidate.kind === 'offering-cards')).toHaveLength(1)
    expect(cards).toMatchObject({
      kind: 'offering-cards',
      sources: sources.slice(0, 3),
    })
  })

  it('marks complete on complete event', () => {
    const complete = reduceAnswerTurnEvent(initialAnswerTurnUiState, {
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

    expect(complete.phase).toBe('complete')
    expect(complete.complete).toBe(true)
    expect(complete.layoutProfile).toBe('discovery_full')
  })

  it('upserts work steps by stable id', () => {
    const running = reduceAnswerTurnEvent(initialAnswerTurnUiState, {
      type: 'work-step',
      step: {
        id: 'search.registry.initial',
        phase: 'search',
        status: 'running',
        title: 'Searching listed businesses',
        startedAtMs: 10,
      },
    })
    const complete = reduceAnswerTurnEvent(running, {
      type: 'work-step',
      step: {
        id: 'search.registry.initial',
        phase: 'search',
        status: 'complete',
        title: 'Searching listed businesses',
        summary: '1 listed business found.',
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
      summary: '1 listed business found.',
    })
    expect(complete.workLog[0]?.detailRows).toEqual([{ label: 'Results', value: '1' }])
  })

  it('marks running work steps as stopped when the user stops the stream', () => {
    const running = reduceAnswerTurnEvent(initialAnswerTurnUiState, {
      type: 'work-step',
      step: {
        id: 'assemble.answer',
        phase: 'assemble',
        status: 'running',
        title: 'Preparing the answer',
        startedAtMs: Date.now() - 5,
      },
    })

    const stopped = stopRunningWorkSteps(running)
    expect(stopped.workLog[0]?.status).toBe('stopped')
    expect(stopped.workLog[0]?.durationMs).toBeGreaterThanOrEqual(0)
  })
})

function offeringSource() {
  return {
    sourceKind: 'offering_v2' as const,
    citationIndex: 1,
    business: {
      businessId: 'business:1',
      slug: 'business-1',
      name: 'Business 1',
      category: 'Data',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: '/business-1',
      observedAt: 1,
      disposition: 'current' as const,
      accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
    },
    offerings: [],
    detailUrl: '/business-1',
  }
}
