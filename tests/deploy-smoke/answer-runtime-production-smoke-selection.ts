import { LOCAL_DEVELOPMENT_BUSINESS_FIXTURE_SLUGS } from '../../src/lib/dev/local-e2e-business-fixtures'
import { DEV_SEED_BUSINESS_FIXTURES } from '../../src/modules/dev/internal/dev-seed-business-fixtures'

export type PublicBusinessCatalogApiV2Dto = Readonly<{
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  offerings: readonly unknown[]
}>

export const ANSWER_SERVICE_SIGNAL = /\b(?:accountant|accounting|aged care|cleaner|cleaning|dentist|dental|electrician|electrical|family lawyer|hvac|lawyer|locksmith|math tutor|photographer|plumber|plumbing|repair|repairs|tutor|tutoring)\b/i

export const DEVELOPMENT_FIXTURE_SLUGS = new Set<string>([
  ...LOCAL_DEVELOPMENT_BUSINESS_FIXTURE_SLUGS,
  ...DEV_SEED_BUSINESS_FIXTURES.map((fixture) => fixture.requestedSlug),
])

export function selectSubject(
  businesses: readonly PublicBusinessCatalogApiV2Dto[],
  seed: string,
): PublicBusinessCatalogApiV2Dto {
  const validBusinesses = businesses.filter((business) => (
    business.slug.trim().length > 0
    && business.name.trim().length > 0
    && business.category.trim().length > 0
    && business.suburb.trim().length > 0
    && business.stateTerritory.trim().length > 0
    && business.offerings.length > 0
  ))
  const pairCounts = new Map<string, number>()
  for (const business of validBusinesses) {
    const key = categoryLocalityKey(business.category, business.suburb, business.stateTerritory)
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
  }

  const eligible = validBusinesses.filter((business) => (
    !DEVELOPMENT_FIXTURE_SLUGS.has(business.slug)
    && pairCounts.get(categoryLocalityKey(business.category, business.suburb, business.stateTerritory)) === 1
  ))
  if (eligible.length === 0) {
    throw new Error('live catalog has no unique fixture-distinct category locality subject')
  }
  return eligible[seedHash(seed) % eligible.length] as PublicBusinessCatalogApiV2Dto
}

function categoryLocalityKey(category: string, suburb: string, stateTerritory: string): string {
  return [category, suburb, stateTerritory].map(normalizeKeyPart).join('\u0000')
}

function normalizeKeyPart(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ')
}

function seedHash(seed: string): number {
  let hash = 2_166_136_261
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}
