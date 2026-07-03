import { afterEach, describe, expect, it } from 'vitest'

import type { FollowUpChip } from '@/modules/answer-thread/public'
import { setLlmFollowUpChipGeneratorForTests } from '@/modules/answer-thread/testing'
import { handleFollowUpChipsRequest } from '@/routes/api.answer.follow-up-chips'

function submitQueries(chips: FollowUpChip[]): string[] {
  return chips.map((chip) => chip.submitQuery)
}

describe('POST /api/answer/follow-up-chips', () => {
  afterEach(() => {
    delete process.env.AE_ANSWER_EVAL_PASSED
    delete process.env.OPENROUTER_API_KEY
    setLlmFollowUpChipGeneratorForTests(undefined)
  })

  it('returns deterministic chips when eval gate has not passed', async () => {
    const response = await handleFollowUpChipsRequest(
      new Request('https://ae.example/api/answer/follow-up-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'emergency plumber parramatta',
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
              responseTimeLabel: '',
              trustCue: 'Checked',
              nextStepLabel: 'Send inquiry',
              detailUrl: '/parramatta-emergency-plumbing',
              services: [],
              inquiryUrl: '/parramatta-emergency-plumbing/inquiry',
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { chips: FollowUpChip[] }
    expect(submitQueries(body.chips)).toContain('Show only businesses that accept inquiries')
    expect(submitQueries(body.chips)).not.toContain('What can Agentic Economy do here?')
  })

  it('appends validated LLM chips when eval gate has passed', async () => {
    process.env.AE_ANSWER_EVAL_PASSED = '1'
    process.env.OPENROUTER_API_KEY = 'test-key'

    setLlmFollowUpChipGeneratorForTests(async () => ['Which take inquiries?'])

    const response = await handleFollowUpChipsRequest(
      new Request('https://ae.example/api/answer/follow-up-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'emergency plumber parramatta',
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
              responseTimeLabel: '',
              trustCue: 'Checked',
              nextStepLabel: 'Send inquiry',
              detailUrl: '/parramatta-emergency-plumbing',
              services: [],
            },
          ],
        }),
      }),
    )

    const body = (await response.json()) as { chips: FollowUpChip[] }
    expect(submitQueries(body.chips)).toContain('Which take inquiries?')
  })
})
