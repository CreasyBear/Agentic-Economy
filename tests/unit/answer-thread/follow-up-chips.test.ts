import { generateText } from 'ai'
import type * as Ai from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildFollowUpChipsSystemPrompt,
  buildFollowUpChipsUserPrompt,
} from '@/modules/answer/public'
import {
  buildDeterministicFollowUpChips,
  buildFollowUpChips,
  classifyFollowUpIntent,
  generateLlmFollowUpChips,
  validateFollowUpChip,
} from '@/modules/answer-thread/public'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

vi.mock('ai', async (importOriginal) => ({
  ...await importOriginal<typeof Ai>(),
  generateText: vi.fn(),
}))

afterEach(() => {
  vi.mocked(generateText).mockReset()
  vi.unstubAllEnvs()
})

function turn(overrides: Partial<PublicThreadTurn> = {}): PublicThreadTurn {
  return {
    turnId: 'turn-1',
    seq: 1,
    query: 'emergency plumber parramatta',
    intent: 'refine_search',
    status: 'complete',
    oneLine: 'One listed business matches.',
    workLog: [],
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
  it('builds deterministic chips with inquiry, suburb, and compare', () => {
    const chips = buildDeterministicFollowUpChips(turn())
    expect(chips[0]).toEqual({
      label: 'Ask Parramatta Emergency Plumbing about this',
      submitQuery: 'Message Parramatta Emergency Plumbing',
    })
    expect(chips.map((chip) => chip.submitQuery)).toContain('Show only businesses accepting requests')
    expect(chips.map((chip) => chip.submitQuery)).toContain('Compare the top two')
    expect(chips.some((chip) => chip.submitQuery.startsWith('Narrow to '))).toBe(true)
    expect(chips.map((chip) => chip.submitQuery)).not.toContain('What can Agentic Economy do here?')
  })

  it('uses v7 instructions for structured follow-up chips', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    vi.mocked(generateText).mockResolvedValue({
      output: {
        chips: [' Compare the top two ', 'Book now and pay today', 'Which take inquiries?'],
      },
    } as never)

    const query = 'emergency plumber parramatta'
    const providers = [provider()]
    const chips = await generateLlmFollowUpChips({ query, providers })

    expect(chips).toEqual(['Compare the top two', 'Which take inquiries?'])
    const call = vi.mocked(generateText).mock.calls[0]
    expect(call).toBeDefined()
    const options = call?.[0]
    expect(options).toMatchObject({
      instructions: buildFollowUpChipsSystemPrompt(),
      prompt: buildFollowUpChipsUserPrompt(query, providers),
    })
    expect(options).not.toHaveProperty('system')
  })

  it('appends validated LLM chips after deterministic chips', () => {
    const chips = buildFollowUpChips({
      turn: turn(),
      llmChips: ['Compare the top two', 'Which take inquiries?'],
    })
    expect(chips[0]).toEqual({
      label: 'Ask Parramatta Emergency Plumbing about this',
      submitQuery: 'Message Parramatta Emergency Plumbing',
    })
    expect(chips.map((chip) => chip.submitQuery)).toContain('Which take inquiries?')
  })

  it('keeps inquiry handoff available after compare-table turns', () => {
    const chips = buildDeterministicFollowUpChips(turn({
      intent: 'compare_known',
      artifacts: [
        {
          kind: 'provider-compare-table',
          providers: [
            provider({ citationIndex: 1, slug: 'top-inquiry-ready', name: 'Top Inquiry Ready' }),
            providerWithoutInquiry({ citationIndex: 2, slug: 'review-only', name: 'Review Only Plumbing' }),
          ],
        },
      ],
    }))

    expect(chips[0]).toEqual({
      label: 'Ask Top Inquiry Ready about this',
      submitQuery: 'Message Top Inquiry Ready',
    })
    expect(chips.map((chip) => chip.submitQuery)).toContain('Show only businesses accepting requests')
  })

  it('keeps listed context after a selected-provider handoff turn', () => {
    const chips = buildDeterministicFollowUpChips(turn({
      intent: 'inquiry_handoff',
      query: 'Message the first one',
      artifacts: [
        {
          kind: 'selected-provider',
          provider: provider({ slug: 'top-inquiry-ready', name: 'Top Inquiry Ready' }),
        },
      ],
    }))

    expect(chips.map((chip) => chip.submitQuery)).not.toContain('Message the first one')
    expect(chips.map((chip) => chip.submitQuery)).toContain('Show only businesses accepting requests')
    expect(chips.map((chip) => chip.submitQuery)).toContain('Narrow to Parramatta')
  })

  it('does not re-add inquiry handoff LLM chips after a selected-provider handoff', () => {
    const chips = buildFollowUpChips({
      turn: turn({
        intent: 'inquiry_handoff',
        query: 'Message the first one',
        artifacts: [
          {
            kind: 'selected-provider',
            provider: provider({ slug: 'top-inquiry-ready', name: 'Top Inquiry Ready' }),
          },
        ],
      }),
      llmChips: ['Message the first one', 'Narrow to Parramatta'],
    })

    expect(chips.map((chip) => chip.submitQuery)).not.toContain('Message the first one')
    expect(chips.map((chip) => chip.submitQuery)).toContain('Narrow to Parramatta')
  })

  it('rejects overclaim chips', () => {
    expect(validateFollowUpChip('Book now and pay today', 1)).toBe(false)
  })

  it('accepts boundary explanation chips', () => {
    expect(validateFollowUpChip('What can Agentic Economy do here?', 1)).toBe(true)
  })

  it('maps deterministic chip strings to known intents', () => {
    expect(classifyFollowUpIntent('Show only businesses accepting requests', 1)).toBe('filter_known')
    expect(classifyFollowUpIntent('Message the first one', 1)).toBe('inquiry_handoff')
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

  it('targets the single inquiry-ready listing when the top listing has no inquiry path', () => {
    const chips = buildDeterministicFollowUpChips(turn({
      artifacts: [
        {
          kind: 'provider-cards',
          providers: [
            providerWithoutInquiry({ citationIndex: 1, slug: 'top-review-only', name: 'Top Review Only' }),
            provider({ citationIndex: 2, slug: 'inquiry-ready-plumbing', name: 'Inquiry Ready Plumbing', inquiryUrl: '/inquiry-ready-plumbing/inquiry' }),
          ],
        },
      ],
    }))

    expect(chips[0]).toEqual({
      label: 'Ask Inquiry Ready Plumbing about this',
      submitQuery: 'Message Inquiry Ready Plumbing',
    })
  })

  it('does not offer a handoff chip when several non-top listings could match', () => {
    const chips = buildDeterministicFollowUpChips(turn({
      artifacts: [
        {
          kind: 'provider-cards',
          providers: [
            providerWithoutInquiry({ citationIndex: 1, slug: 'top-review-only', name: 'Top Review Only' }),
            provider({ citationIndex: 2, slug: 'first-inquiry-ready', name: 'First Inquiry Ready', inquiryUrl: '/first-inquiry-ready/inquiry' }),
            provider({ citationIndex: 3, slug: 'second-inquiry-ready', name: 'Second Inquiry Ready', inquiryUrl: '/second-inquiry-ready/inquiry' }),
          ],
        },
      ],
    }))

    expect(chips.map((chip) => chip.submitQuery)).not.toContain('Message the first one')
    expect(chips[0]?.submitQuery).toBe('Show only businesses accepting requests')
  })
})

function provider(
  overrides: Partial<Extract<PublicThreadTurn['artifacts'][number], { kind: 'provider-cards' }>['providers'][number]> = {},
) {
  return {
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
    ...overrides,
  }
}

function providerWithoutInquiry(
  overrides: Partial<Extract<PublicThreadTurn['artifacts'][number], { kind: 'provider-cards' }>['providers'][number]> = {},
) {
  const { inquiryUrl: _inquiryUrl, ...source } = provider(overrides)
  return source
}
