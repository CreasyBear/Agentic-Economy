import { buildPublicBusinessSeo, type PublicBusinessSeoCatalog, type PublicBusinessSeoContract } from './public'

export function buildPublicBusinessRouteSeo(catalog: PublicBusinessSeoCatalog, canonicalBaseUrl: string): PublicBusinessSeoContract {
  const seo = buildPublicBusinessSeo({ catalog, options: { canonicalBaseUrl } })
  const primaryOffering = catalog.offerings.at(0)?.name ?? catalog.category
  const location = catalog.businessContext.kind === 'local_human'
    ? `${catalog.businessContext.suburb}, ${catalog.businessContext.stateTerritory}`
    : `${catalog.businessContext.providerIdentifier} (${catalog.businessContext.website})`

  return {
    ...seo,
    title: `${primaryOffering} from ${catalog.name} | Agentic Economy`,
    description: `See what ${catalog.name} offers in ${location}. Compare service area, hours, and how to reach them.`,
  }
}
