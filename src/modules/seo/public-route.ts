import { buildPublicBusinessSeo, type PublicBusinessSeoCatalog } from './public'

export function buildPublicBusinessRouteSeo(catalog: PublicBusinessSeoCatalog, canonicalBaseUrl: string) {
  return buildPublicBusinessSeo({ catalog, options: { canonicalBaseUrl } })
}
