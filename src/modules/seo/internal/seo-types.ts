import type { PublicBusinessCatalogApiV2Dto, PublicListingDto } from '@/modules/registry/public'
import type { JsonLdObject } from './json-ld'

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
  PublicListingDto,
  'offeringRef' | 'name' | 'category' | 'summary' | 'serviceAreaSummary'
>

export type PublicBusinessSeoCatalog = Pick<
  PublicBusinessCatalogApiV2Dto,
  'slug' | 'name' | 'category' | 'businessContext'
> & {
  offerings: readonly PublicBusinessSeoOffering[]
}

export type BuildPublicBusinessSeoInput = {
  catalog: PublicBusinessSeoCatalog
  options?: BuildPublicBusinessSeoOptions
}
