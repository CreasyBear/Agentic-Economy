import type { PublicBusinessCatalogApiV2Dto, PublicOfferingDto } from '@/modules/registry/public'
import type { JsonLdObject } from './internal/json-ld'
export { serializeJsonLd } from './internal/json-ld'

export const SeoIndexDirectiveValues = ['index', 'noindex'] as const
export type SeoIndexDirective = (typeof SeoIndexDirectiveValues)[number]

export type PublicBusinessSeoContract = {
  slug: string
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

export type PublicBusinessSeoOffering = Pick<
  PublicOfferingDto,
  'offeringRef' | 'name' | 'category' | 'summary' | 'serviceAreaSummary'
>

export type PublicBusinessSeoCatalog = Pick<
  PublicBusinessCatalogApiV2Dto,
  'slug' | 'name' | 'category' | 'suburb' | 'stateTerritory'
> & {
  offerings: readonly PublicBusinessSeoOffering[]
}

export type BuildPublicBusinessSeoInput = {
  catalog: PublicBusinessSeoCatalog
  options?: BuildPublicBusinessSeoOptions
}
export { buildPublicBusinessSeo } from './internal/public-business-seo'

export type PublicThreadSeoContract = {
  threadId: string
  title: string
  description: string
  canonicalUrl: string
  indexDirective: SeoIndexDirective
  ogType: 'article' | 'website'
}

export type BuildPublicThreadSeoOptions = {
  canonicalBaseUrl?: string
}

export type BuildPublicThreadSeoInput = {
  threadId: string
  title: string
  firstTurnOneLine?: string
  options?: BuildPublicThreadSeoOptions
}

export { buildPublicThreadSeo } from './internal/public-thread-seo'

export type { JsonLdObject }
