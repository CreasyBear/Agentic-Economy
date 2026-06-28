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

export type BuildPublicBusinessSeoInput = {
  catalog: PublicCatalogContract
  options?: BuildPublicBusinessSeoOptions
}

export const buildPublicBusinessSeo = buildPublicBusinessSeoImpl

export type { JsonLdObject }
