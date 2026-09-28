import {
  buildPublicBusinessSeo,
  serializeJsonLd,
  type PublicBusinessSeoCatalog,
  type PublicBusinessSeoContract,
} from './public'

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

export type PublicBusinessPageHeadLoaderData =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{
      kind: 'available'
      page: Readonly<{ catalog: Readonly<{ name: string }> }>
      seo?: PublicBusinessSeoContract
    }>

export function buildPublicBusinessPageHead(
  loaderData: PublicBusinessPageHeadLoaderData | undefined,
): {
  meta: Array<{
    title?: string
    name?: string
    property?: string
    content?: string
  }>
  links?: Array<{ rel: string; href: string }>
  scripts?: Array<{ type: string; children: string }>
} {
  if (loaderData?.kind === 'unavailable') {
    return {
      meta: [
        { title: 'Supplier unavailable | Agentic Economy' },
        { name: 'description', content: 'The supplier catalogue source is unavailable right now. Try again in a moment.' },
        { name: 'robots', content: 'noindex' },
      ],
    }
  }

  if (loaderData === undefined) {
    return {
      meta: [
        { title: 'Page not found | Agentic Economy' },
        { name: 'robots', content: 'noindex' },
      ],
    }
  }
  if (loaderData.seo === undefined) {
    return {
      meta: [
        { title: `${loaderData.page.catalog.name} Tools | Agentic Economy` },
        { name: 'description', content: `Browse published Tools, prices, readiness, and access paths from ${loaderData.page.catalog.name}.` },
      ],
    }
  }

  return {
    meta: [
      { title: `${loaderData.page.catalog.name} Tools | Agentic Economy` },
      { name: 'description', content: `Browse published Tools, prices, readiness, and access paths from ${loaderData.page.catalog.name}.` },
      { name: 'robots', content: loaderData.seo.indexDirective },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Agentic Economy' },
      { property: 'og:title', content: `${loaderData.page.catalog.name} Tools | Agentic Economy` },
      { property: 'og:description', content: `Browse published Tools, prices, readiness, and access paths from ${loaderData.page.catalog.name}.` },
      { property: 'og:url', content: loaderData.seo.canonicalUrl },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: `${loaderData.page.catalog.name} Tools | Agentic Economy` },
      { name: 'twitter:description', content: `Browse published Tools, prices, readiness, and access paths from ${loaderData.page.catalog.name}.` },
    ],
    links: [{ rel: 'canonical', href: loaderData.seo.canonicalUrl }],
    scripts: [
      {
        type: 'application/ld+json',
        children: serializeJsonLd(loaderData.seo.jsonLd),
      },
    ],
  }
}
