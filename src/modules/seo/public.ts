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
  'slug' | 'name' | 'category' | 'businessContext'
> & {
  offerings: readonly PublicBusinessSeoOffering[]
}

export type BuildPublicBusinessSeoInput = {
  catalog: PublicBusinessSeoCatalog
  options?: BuildPublicBusinessSeoOptions
}
export { buildPublicBusinessSeo } from './internal/public-business-seo'
export {
  SeoSiteName,
  buildFaqPageJsonLd,
  buildPublicPageHead,
  buildSiteJsonLd,
} from './internal/public-page-seo'
export type { PublicPageHead, PublicPageSeoInput } from './internal/public-page-seo'
export { indexedPublicPagePaths } from './internal/indexed-public-paths'

export type { JsonLdObject }
