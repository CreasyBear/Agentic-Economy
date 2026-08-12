import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type { BusinessContext } from '@/modules/business/public'
import type {
  BuildPublicBusinessSeoInput,
  PublicBusinessSeoContract,
  PublicBusinessSeoOffering,
} from '@/modules/seo/public'
import type { JsonLdObject } from './json-ld'

export function buildPublicBusinessSeo(input: BuildPublicBusinessSeoInput): PublicBusinessSeoContract {
  const canonicalBaseUrl = trimTrailingSlashes(input.options?.canonicalBaseUrl ?? 'https://ae.example')
  const canonicalUrl = `${canonicalBaseUrl}/${input.catalog.slug}`
  const primaryOffering = input.catalog.offerings.at(0)
  const offeringPhrase = primaryOffering?.name ?? input.catalog.category
  const location = businessContextLabel(input.catalog.businessContext)

  return {
    slug: input.catalog.slug,
    title: `${input.catalog.name} | ${offeringPhrase} in ${location}`,
    description: `${input.catalog.name} publishes ${offeringPhrase} service facts for ${location}. Compare details and send a qualified inquiry where available.`,
    h1: input.catalog.name,
    canonicalUrl,
    indexDirective: 'index',
    jsonLd: [
      buildBusinessJsonLd(input.catalog.name, input.catalog.category, input.catalog.businessContext, canonicalUrl),
      ...input.catalog.offerings.map((offering) => buildOfferingJsonLd(offering, location, canonicalUrl)),
      buildBreadcrumbJsonLd(input.catalog.name, canonicalBaseUrl, canonicalUrl),
    ],
  }
}

function buildBusinessJsonLd(
  name: string,
  category: string,
  context: BusinessContext,
  canonicalUrl: string,
): JsonLdObject {
  const location = businessContextLabel(context)
  return {
    '@context': 'https://schema.org',
    '@type': context.kind === 'local_human' ? 'LocalBusiness' : 'Organization',
    '@id': `${canonicalUrl}#business`,
    name,
    url: canonicalUrl,
    description: `${category} service catalog for ${location}`,
    ...(context.kind === 'local_human'
      ? { areaServed: location }
      : { identifier: context.providerIdentifier, sameAs: [context.website] }),
  }
}
function businessContextLabel(context: BusinessContext): string {
  return context.kind === 'local_human'
    ? `${context.suburb}, ${context.stateTerritory}`
    : `${context.providerIdentifier} (${context.website})`
}

function buildOfferingJsonLd(
  offering: PublicBusinessSeoOffering,
  location: string,
  canonicalUrl: string
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${canonicalUrl}#offering-${offering.offeringRef}`,
    name: offering.name,
    serviceType: offering.category,
    description: offering.summary,
    areaServed: offering.serviceAreaSummary ?? location,
    provider: {
      '@id': `${canonicalUrl}#business`,
    },
  }
}

function buildBreadcrumbJsonLd(name: string, canonicalBaseUrl: string, canonicalUrl: string): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Service pages',
        item: canonicalBaseUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name,
        item: canonicalUrl,
      },
    ],
  }
}

