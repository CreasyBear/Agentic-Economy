import { describe, expect, it } from 'vitest'

import {
  filterProvidersBySuburb,
  findThreadNeedQuery,
  parseNarrowToSuburb,
  resolveFollowUpRegistryQuery,
  resolveNarrowToSearchQuery,
  resolveThreadRegistryQuery,
} from '@/modules/answer-thread/internal/follow-up-query'

describe('follow-up query resolution', () => {
  it('parses narrow-to chip labels', () => {
    expect(parseNarrowToSuburb('Narrow to Parramatta')).toBe('Parramatta')
  })
  it('recognizes natural location refinement wording', () => {
    expect(parseNarrowToSuburb('Only show options near Adelaide')).toBe('Adelaide')
  })


  it('combines the thread need with the suburb for registry search', () => {
    expect(
      resolveNarrowToSearchQuery('Parramatta', [{ query: 'plumber' }]),
    ).toBe('plumber Parramatta')
  })

  it('skips the need query when the suburb is already present', () => {
    expect(
      resolveNarrowToSearchQuery('Parramatta', [{ query: 'plumber parramatta' }]),
    ).toBe('plumber parramatta')
  })

  it('finds the latest non-chip query in the thread', () => {
    expect(
      findThreadNeedQuery([
        { query: 'locksmith Footscray' },
        { query: 'Narrow to Parramatta' },
        { query: 'plumber Brunswick' },
      ]),
    ).toBe('plumber Brunswick')
  })

  it('resolves narrow chips for registry search', () => {
    expect(
      resolveFollowUpRegistryQuery('Narrow to Parramatta', [{ query: 'plumber' }]),
    ).toBe('plumber Parramatta')
  })

  it('uses the latest full search as the active thread registry query', () => {
    expect(
      resolveThreadRegistryQuery([
        { query: 'Locksmith open now Footscray' },
        { query: 'Emergency plumber Brunswick' },
      ]),
    ).toBe('Emergency plumber Brunswick')
  })

  it('keeps chip follow-ups attached to the active thread registry query', () => {
    expect(
      resolveThreadRegistryQuery([
        { query: 'plumber' },
        { query: 'Narrow to Parramatta' },
        { query: 'What can Agentic Economy do here?' },
      ]),
    ).toBe('plumber Parramatta')
  })

  it('does not let inquiry handoff follow-ups replace the active registry query', () => {
    expect(
      findThreadNeedQuery([
        { query: 'plumber' },
        { query: 'Prepare a qualified inquiry for the first listed business' },
      ]),
    ).toBe('plumber')
    expect(
      resolveThreadRegistryQuery([
        { query: 'plumber' },
        { query: 'Prepare a qualified inquiry for the first listed business' },
        { query: 'Narrow to Parramatta' },
      ]),
    ).toBe('plumber Parramatta')
  })

  it('keeps first-turn compare searches as search context', () => {
    expect(
      resolveThreadRegistryQuery([
        { query: 'Compare emergency plumbers in Parramatta' },
      ]),
    ).toBe('Compare emergency plumbers in Parramatta')
  })

  it('filters frozen providers by catalog suburb', () => {
    const providers = [
      { suburb: 'Perth', serviceArea: 'Perth metro' },
      { suburb: 'Parramatta', serviceArea: 'Parramatta and nearby suburbs' },
      { suburb: 'Parramatta', serviceArea: 'Parramatta' },
      { suburb: 'Parramatta', serviceArea: 'Perth metro' },
    ]

    expect(filterProvidersBySuburb(providers, 'Parramatta')).toHaveLength(3)
    expect(filterProvidersBySuburb(providers, 'Perth')).toHaveLength(1)
    expect(filterProvidersBySuburb(providers, 'Perth')).toEqual([providers[0]])
  })
})
