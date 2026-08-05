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
    expect(prose.summary).toContain('published services')
  })
})

describe('named option compact prose', () => {
  it('leads with the named option and its published decision details', () => {
    const prose = buildCompactFollowUpProse({
      displayQuery: 'dentist Adelaide',
      providers: [provider({
        name: 'Adelaide Dental Clinic',
        suburb: 'Adelaide',
        pricingSummary: 'From $120',
        availabilitySummary: 'Appointments this week',
      })],
    })

    expect(prose.oneLine).toBe(
      'Adelaide Dental Clinic — in Adelaide · Price: From $120 · Published availability: Appointments this week.',
    )
  })
})

describe('compact snapshot artifacts', () => {
  it('omits map, summary, agent json, and trust strip on follow-up turns', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'plumber Parramatta',
      oneLine: '2 listed in Parramatta.',
      providers: [provider()],
      summary: 'The business confirms timing, price, availability, and the work.',
      nextStep: 'Open a listed business page and send an inquiry when that option is published. The business confirms timing, price, availability, and the work.',
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

  it.each([
    'plumber in Parramatta',
    'plumber near Parramatta',
    'plumber around Parramatta',
    'plumber at Parramatta',
  ])('preserves explicit location phrases: %s', (query) => {
    expect(parseLocationIntent(query)).toEqual({
      label: 'Parramatta',
      placeQuery: 'Parramatta, Australia',
    })
  })

  it('extracts service-area wording before trailing urgency language', () => {
    expect(parseLocationIntent('Burst pipe plumber serving Parramatta immediately')).toEqual({
      label: 'Parramatta',
      placeQuery: 'Parramatta, Australia',
    })
  })

  it('stops explicit places before a follow-on instruction', () => {
    expect(
      parseLocationIntent('Compare plumbers near Parramatta and tell me what to confirm before booking'),
    ).toEqual({
      label: 'Parramatta',
      placeQuery: 'Parramatta, Australia',
    })
  })

  it('preserves postcode location intent', () => {
    expect(parseLocationIntent('2150')).toEqual({
      label: '2150',
      placeQuery: 'Postcode 2150, Australia',
    })
  })

  it.each([
    'My BAS is overdue and my books are a mess',
    'plumber Parramatta please',
  ])('does not infer a location from a lowercase trailing word: %s', (query) => {
    expect(parseLocationIntent(query)).toBeUndefined()
  })
})
