import { buildPublicOwnerStatusReadback, type PublicOwnerStatusReadback } from '@/modules/catalog/public'
import { getPublicBusinessOfferingSupplyBySlug, type PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { createDefaultPublicRegistryFixtureState } from './registry-local-e2e'
import { DEFAULT_LOCAL_REGISTRY_FIXTURE_SLUG } from './local-e2e-business-fixtures'

export function getDefaultPublicBusinessStatusReadback(): PublicOwnerStatusReadback<PublicBusinessCatalogApiV2Dto> {
  const result = getPublicBusinessOfferingSupplyBySlug(createDefaultPublicRegistryFixtureState(), {
    slug: DEFAULT_LOCAL_REGISTRY_FIXTURE_SLUG,
  })
  if (result.kind !== 'found') throw new Error('Default public business fixture is required.')
  return buildPublicOwnerStatusReadback(result.business)
}
