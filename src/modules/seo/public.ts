import type { Slug } from '@/modules/common/ids'
import type { PublicCatalogContract } from '@/modules/catalog/public'
import { buildPublicBusinessSeo as buildPublicBusinessSeoImpl } from './internal/public-business-seo'
import type { JsonLdObject } from './internal/json-ld'
export { serializeJsonLd } from './internal/json-ld'

export const SeoIndexDirectiveValues = ['index', 'noindex'] as const
export type SeoIndexDirective = (typeof SeoIndexDirectiveValues)[number]

export type PublicBusinessSeoContract = {
  slug: Slug
  title: string
  description: string
  h1: string
  canonicalUrl: string
  indexDirective: SeoIndexDirective
  jsonLd: readonly JsonLdObject[]
}

export type BuildPublicBusinessSeoOptions = {
  canonicalBaseUrl?: string
}

export type PublicBusinessSeoService = Pick<PublicCatalogContract['services'][number], 'serviceSlug' | 'name' | 'category' | 'summary' | 'serviceArea'>

export type PublicBusinessSeoCatalog = Pick<
  PublicCatalogContract,
  'slug' | 'name' | 'category' | 'suburb' | 'stateTerritory'
> & {
  services: readonly PublicBusinessSeoService[]
}

export type BuildPublicBusinessSeoInput = {
  catalog: PublicBusinessSeoCatalog
  options?: BuildPublicBusinessSeoOptions
}

export const buildPublicBusinessSeo = buildPublicBusinessSeoImpl

export type { JsonLdObject }
