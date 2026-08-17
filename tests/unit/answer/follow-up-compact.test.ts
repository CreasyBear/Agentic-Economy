import { describe, expect, it } from 'vitest'

import { buildArtifactsFromSnapshot } from '@/modules/answer/internal/snapshot-artifacts'
import { parseLocationIntent } from '@/modules/answer/internal/location-intent'
import type { AnswerSource } from '@/modules/answer/public'

type ProviderOverrides = Omit<Partial<AnswerSource>, 'inquiryUrl'> & { inquiryUrl?: string | undefined }
const provider = (overrides: ProviderOverrides = {}): AnswerSource => {
  const { inquiryUrl, ...otherOverrides } = overrides
  return {
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
    ...otherOverrides,
    ...(inquiryUrl === undefined
      ? ('inquiryUrl' in overrides ? {} : { inquiryUrl: '/demo/inquiry' })
      : { inquiryUrl }),
  }
}

describe('empty-state recovery prompts', () => {
  it('builds nearby recovery from normalized service and named suburb fields', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'emergency plumber in Parramatta',
      oneLine: 'No businesses match this request yet.',
      providers: [],
      summary: 'No matches found in Parramatta yet.',
      nextStep: 'Try another suburb.',
      agentJsonUrl: '',
      layoutProfile: 'empty_state',
    })
    const recovery = artifacts.find((artifact) => artifact.kind === 'recovery-prompts')
    expect(recovery?.kind).toBe('recovery-prompts')
    if (recovery?.kind !== 'recovery-prompts') throw new Error('expected recovery prompts')

    expect(recovery.prompts[0]).toEqual({
      label: 'Search a nearby suburb',
      query: 'emergency plumber near Parramatta',
    })
    expect(recovery.prompts[0]?.query).not.toContain('No businesses match')
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
  it.each([
    'Urgent plumber in Parramatta tonight',
    'Urgent plumber in Parramatta under $200 and without weekend callouts',
    'Compare plumbers near Parramatta and tell me what to confirm before booking',
  ])('stops an explicit place before later constraints: %s', (query) => {
    expect(parseLocationIntent(query)).toEqual({
      label: 'Parramatta',
      placeQuery: 'Parramatta, Australia',
    })
  })

  it.each([
    'I need a plumber in the afternoon',
    'I need a plumber in advance',
    'I need a plumber in need of help',
  ])('does not treat a non-location "in ..." phrase as a place: %s', (query) => {
    expect(parseLocationIntent(query)).toBeUndefined()
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
