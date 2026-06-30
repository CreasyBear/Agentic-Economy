import { describe, expect, it } from 'vitest'

import {
  extractRequestedLocation,
  filterProvidersForRequestedLocation,
} from '@/modules/answer/internal/provider-location-filter'
import type { AnswerSource } from '@/modules/answer/public'

const provider = (overrides: Partial<AnswerSource> = {}): AnswerSource => ({
  citationIndex: 1,
  slug: 'parramatta-emergency-plumbing',
  name: 'Parramatta Emergency Plumbing',
  category: 'Emergency plumbing',
  suburb: 'Parramatta',
  stateTerritory: 'NSW',
  serviceArea: 'Parramatta and nearby suburbs',
  hoursLabel: 'Hours supplied by owner',
  availabilityLabel: 'Needs confirmation',
  trustLabel: 'Checked',
  responseTimeLabel: 'Response time not supplied',
  trustCue: 'Checked',
  nextStepLabel: 'Send inquiry',
  detailUrl: '/parramatta-emergency-plumbing',
  inquiryUrl: '/parramatta-emergency-plumbing/inquiry',
  services: [{ name: 'Emergency pipe repair', category: 'Emergency plumbing', summary: 'Emergency pipe repair' }],
  ...overrides,
})

describe('provider location filtering', () => {
  it('extracts trailing suburb intent without treating service words as places', () => {
    expect(extractRequestedLocation('Emergency plumber Brunswick')).toBe('Brunswick')
    expect(extractRequestedLocation('Brunswick emergency plumber')).toBe('Brunswick')
    expect(extractRequestedLocation('Port Melbourne plumber')).toBe('Port Melbourne')
    expect(extractRequestedLocation('Electrician same day Geelong')).toBe('Geelong')
    expect(extractRequestedLocation('Narrow to Parramatta')).toBe('Parramatta')
    expect(extractRequestedLocation('locksmith open now Footscray')).toBe('Footscray')
    expect(extractRequestedLocation('plumber in Brunswick VIC')).toBe('Brunswick')
    expect(extractRequestedLocation('emergency plumbing')).toBeUndefined()
    expect(extractRequestedLocation('plumber')).toBeUndefined()
  })

  it('uses user location when a tool search drops the requested suburb', () => {
    const result = filterProvidersForRequestedLocation({
      userQuery: 'Emergency plumber Brunswick',
      toolQuery: 'emergency plumbing',
      providers: [provider()],
    })

    expect(result).toMatchObject({
      location: 'Brunswick',
      locationSource: 'user',
      filtered: true,
      providers: [],
    })
  })

  it('keeps the user suburb authoritative when the tool picks a different place', () => {
    const result = filterProvidersForRequestedLocation({
      userQuery: 'Emergency plumber Brunswick',
      toolQuery: 'emergency plumber Perth',
      providers: [
        provider({
          slug: 'perth-plumbing',
          suburb: 'Perth',
          serviceArea: 'Perth metro',
        }),
      ],
    })

    expect(result).toMatchObject({
      location: 'Brunswick',
      locationSource: 'user',
      filtered: true,
      providers: [],
    })
  })

  it('does not treat service summaries as location coverage', () => {
    const result = filterProvidersForRequestedLocation({
      userQuery: 'Emergency plumber Brunswick',
      toolQuery: 'emergency plumbing',
      providers: [
        provider({
          services: [
            {
              name: 'Emergency pipe repair',
              category: 'Emergency plumbing',
              summary: 'Emergency pipe repair requested by a Brunswick customer',
            },
          ],
        }),
      ],
    })

    expect(result.providers).toEqual([])
    expect(result.rejectedProviders.map((candidate) => candidate.slug)).toEqual([
      'parramatta-emergency-plumbing',
    ])
  })

  it('trusts a corrected tool location over the misspelled user location', () => {
    const result = filterProvidersForRequestedLocation({
      userQuery: 'paramata',
      toolQuery: 'parramatta',
      providers: [provider()],
    })

    expect(result.location).toBe('parramatta')
    expect(result.locationSource).toBe('tool')
    expect(result.providers.map((candidate) => candidate.slug)).toEqual([
      'parramatta-emergency-plumbing',
    ])
  })
})
