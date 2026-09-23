import type { JsonLdObject } from './internal/json-ld'
export { serializeJsonLd } from './internal/json-ld'

export {
  SeoIndexDirectiveValues,
  type BuildPublicBusinessSeoInput,
  type BuildPublicBusinessSeoOptions,
  type PublicBusinessSeoCatalog,
  type PublicBusinessSeoContract,
  type PublicBusinessSeoOffering,
  type SeoIndexDirective,
} from './internal/seo-types'

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
