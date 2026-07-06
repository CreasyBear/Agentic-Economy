import { buildPublicBusinessSeo, type PublicBusinessSeoCatalog, type PublicBusinessSeoContract } from './public'

export function buildPublicBusinessRouteSeo(catalog: PublicBusinessSeoCatalog, canonicalBaseUrl: string): PublicBusinessSeoContract {
  const seo = buildPublicBusinessSeo({ catalog, options: { canonicalBaseUrl } })
  const primaryService = catalog.services.at(0)?.name ?? catalog.category
  const location = `${catalog.suburb}, ${catalog.stateTerritory}`

  return {
    ...seo,
    title: `${primaryService} from ${catalog.name} | Agentic Economy`,
    description: `See what ${catalog.name} offers in ${location}. Compare service area, hours, and how to reach them.`,
  }
}
