import { describe, expect, it } from 'vitest'

import {
  initialAnswerTurnUiState,
  reduceAnswerTurnEvent,
} from '@/components/ae/chat/answer-turn-state'
import type { AnswerSource } from '@/modules/answer/public'

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
      label: 'Finding listed providers',
      step: 'read',
    })

    expect(advanced.thinkingSteps).toEqual(['Searching listed businesses…'])
    expect(advanced.thinkingLabel).toBe('Finding listed providers')
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
})
