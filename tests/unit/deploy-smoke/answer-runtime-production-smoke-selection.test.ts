import { describe, expect, it } from 'vitest'

import {
  DEVELOPMENT_FIXTURE_SLUGS,
  selectSubject,
  type PublicBusinessCatalogApiV2Dto,
} from '../../deploy-smoke/answer-runtime-production-smoke-selection'

const fixtureSlug = [...DEVELOPMENT_FIXTURE_SLUGS][0]
if (fixtureSlug === undefined) throw new Error('development fixture slug set must not be empty')

const baseBusiness = {
  name: 'Runtime selection subject',
  category: 'Plumbing',
  suburb: 'Collision suburb',
  stateTerritory: 'ZZ',
  offerings: [{ name: 'Service', category: 'Plumbing' }],
} satisfies Omit<PublicBusinessCatalogApiV2Dto, 'slug'>

function business(
  slug: string,
  overrides: Partial<Omit<PublicBusinessCatalogApiV2Dto, 'slug'>> = {},
): PublicBusinessCatalogApiV2Dto {
  return { ...baseBusiness, ...overrides, slug }
}

describe('answer runtime subject selection', () => {
  it('counts a fixture collision before excluding fixture subjects', () => {
    const nonFixtureSlug = `${fixtureSlug}-runtime-collision`

    expect(() => selectSubject([
      business(fixtureSlug),
      business(nonFixtureSlug),
    ], 'collision-seed')).toThrow(
      'live catalog has no unique fixture-distinct category locality subject',
    )
  })

  it('keeps a structurally unique non-fixture subject selectable and deterministic', () => {
    const nonFixtureCollisionSlug = `${fixtureSlug}-runtime-collision`
    const uniqueSlug = `${fixtureSlug}-runtime-unique`
    const catalog = [
      business(fixtureSlug),
      business(nonFixtureCollisionSlug),
      business(uniqueSlug, { suburb: 'Unique suburb' }),
    ]

    expect(selectSubject(catalog, 'stable-seed').slug).toBe(uniqueSlug)
    expect(selectSubject(catalog, 'stable-seed').slug).toBe(uniqueSlug)
  })

  it('does not restrict runtime subjects to a hard-coded service vocabulary', () => {
    const subject = business(`${fixtureSlug}-family-law`, {
      category: 'Family law',
      suburb: 'Vocabulary-independent suburb',
    })

    expect(selectSubject([subject], 'family-law-seed')).toEqual(subject)
  })
})
