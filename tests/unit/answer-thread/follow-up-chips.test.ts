import { describe, expect, it } from 'vitest'

import {
  buildDeterministicFollowUpChips,
  buildFollowUpChips,
  classifyFollowUpIntent,
  validateFollowUpChip,
} from '@/modules/answer-thread/public'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

function turn(overrides: Partial<PublicThreadTurn> = {}): PublicThreadTurn {
  return {
    turnId: 'turn-1',
    seq: 1,
    query: 'emergency plumber parramatta',
    intent: 'refine_search',
    status: 'complete',
    oneLine: 'One listed business matches.',
    artifacts: [
      {
        kind: 'provider-cards',
        providers: [
          {
            citationIndex: 1,
            slug: 'parramatta-emergency-plumbing',
            name: 'Parramatta Emergency Plumbing',
            category: 'Plumber',
            suburb: 'Parramatta',
            stateTerritory: 'NSW',
            serviceArea: 'Parramatta',
            hoursLabel: 'Hours supplied',
            availabilityLabel: 'Published',
            trustLabel: 'Checked',
            responseTimeLabel: 'Responds ~22m',
            trustCue: 'Responds ~22m · Checked',
            nextStepLabel: 'Send inquiry',
            detailUrl: '/parramatta-emergency-plumbing',
            services: [],
            inquiryUrl: '/parramatta-emergency-plumbing/inquiry',
          },
          {
            citationIndex: 2,
            slug: 'westmead-plumbing',
            name: 'Westmead Plumbing',
            category: 'Plumber',
            suburb: 'Westmead',
            stateTerritory: 'NSW',
            serviceArea: 'Westmead',
            hoursLabel: 'Hours supplied',
            availabilityLabel: 'Published',
            trustLabel: 'Checked',
            responseTimeLabel: 'Responds ~22m',
            trustCue: 'Responds ~22m · Checked',
            nextStepLabel: 'Send inquiry',
            detailUrl: '/westmead-plumbing',
            services: [],
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('follow-up chips', () => {
  it('builds deterministic chips with inquiry, suburb, compare, and boundary', () => {
    const chips = buildDeterministicFollowUpChips(turn())
    expect(chips.map((chip) => chip.submitQuery)).toContain('Show only businesses that accept inquiries')
    expect(chips.map((chip) => chip.submitQuery)).toContain('Compare the top two')
    expect(chips.map((chip) => chip.submitQuery)).toContain('What can Agentic Economy do here?')
    expect(chips.some((chip) => chip.submitQuery.startsWith('Narrow to '))).toBe(true)
    expect(chips.some((chip) => chip.label === 'What AE can do')).toBe(true)
  })

  it('appends validated LLM chips after deterministic chips', () => {
    const chips = buildFollowUpChips({
      turn: turn(),
      llmChips: ['Compare the top two', 'Which take inquiries?'],
    })
    expect(chips[0]?.submitQuery).toBe('Show only businesses that accept inquiries')
    expect(chips.map((chip) => chip.submitQuery)).toContain('Which take inquiries?')
  })

  it('rejects overclaim chips', () => {
    expect(validateFollowUpChip('Book now and pay today', 1)).toBe(false)
  })

  it('maps deterministic chip strings to known intents', () => {
    expect(classifyFollowUpIntent('Show only businesses that accept inquiries', 1)).toBe('filter_known')
    expect(classifyFollowUpIntent('Compare the top two', 1)).toBe('compare_known')
    expect(classifyFollowUpIntent('What can Agentic Economy do here?', 1)).toBe('explain_boundary')
    expect(classifyFollowUpIntent('Narrow to Parramatta', 1)).toBe('refine_search')
  })

  it('suggests the dominant suburb when results span multiple areas', () => {
    const chips = buildDeterministicFollowUpChips(
      turn({
        query: 'plumber',
        artifacts: [
          {
            kind: 'provider-cards',
            providers: [
              {
                citationIndex: 1,
                slug: 'perth-plumbing',
                name: 'Perth Plumbing',
                category: 'Plumber',
                suburb: 'Perth',
                stateTerritory: 'WA',
                serviceArea: 'Perth metro',
                hoursLabel: 'Hours supplied',
                availabilityLabel: 'Published',
            trustLabel: 'Checked',
            responseTimeLabel: '',
            trustCue: 'Checked',
            nextStepLabel: 'Send inquiry',
                detailUrl: '/perth-plumbing',
                services: [],
              },
              {
                citationIndex: 2,
                slug: 'parramatta-emergency-plumbing',
                name: 'Parramatta Emergency Plumbing',
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
                detailUrl: '/parramatta-emergency-plumbing',
                services: [],
                inquiryUrl: '/parramatta-emergency-plumbing/inquiry',
              },
              {
                citationIndex: 3,
                slug: 'demo-plumbing',
                name: 'Demo Plumbing',
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
                detailUrl: '/demo-plumbing',
                services: [],
                inquiryUrl: '/demo-plumbing/inquiry',
              },
            ],
          },
        ],
      }),
    )

    expect(chips.map((chip) => chip.submitQuery)).toContain('Narrow to Parramatta')
  })
})
