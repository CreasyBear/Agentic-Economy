import { describe, expect, it } from 'vitest'

import { buildCompactFollowUpProse } from '@/modules/answer/internal/follow-up-compact-prose'
import { buildArtifactsFromSnapshot } from '@/modules/answer/internal/snapshot-artifacts'
import { parseLocationIntent } from '@/modules/answer/internal/location-intent'
import type { AnswerSource } from '@/modules/answer/public'

const provider = (overrides: Partial<AnswerSource> = {}): AnswerSource => ({
  citationIndex: 1,
  slug: 'demo',
  name: 'Demo Plumbing',
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
  detailUrl: '/demo',
  services: [],
  inquiryUrl: '/demo/inquiry',
  ...overrides,
})

describe('follow-up compact prose', () => {
  it('uses short narrow copy from the chip label', () => {
    const prose = buildCompactFollowUpProse({
      followUpIntent: 'refine_search',
      displayQuery: 'Narrow to Parramatta',
      providers: [provider(), provider({ citationIndex: 2, slug: 'other', name: 'Other Plumbing' })],
    })

    expect(prose.oneLine).toBe('2 listed in Parramatta.')
    expect(prose.summary).toContain('The business handles timing, price, and availability')
  })
})

describe('compact snapshot artifacts', () => {
  it('omits map, summary, agent json, and trust strip on follow-up turns', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'plumber Parramatta',
      oneLine: '2 listed in Parramatta.',
      providers: [provider()],
      summary: 'The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
      nextStep: 'Open a listed provider page and send an inquiry when that option is published. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      compactLayout: true,
    })

    expect(artifacts.map((artifact) => artifact.kind)).toEqual(['one-line', 'provider-cards', 'what-to-do-now'])
  })
})

describe('location intent', () => {
  it('does not treat narrow chip labels as map queries', () => {
    expect(parseLocationIntent('Narrow to Parramatta')).toBeUndefined()
  })

  it('uses the suburb token for need plus suburb searches', () => {
    expect(parseLocationIntent('plumber Parramatta')).toEqual({
      label: 'Parramatta',
      placeQuery: 'Parramatta, Australia',
    })
  })
})
