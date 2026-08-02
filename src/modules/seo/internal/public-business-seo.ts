import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
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
  const location = `${input.catalog.suburb}, ${input.catalog.stateTerritory}`

  return {
    slug: input.catalog.slug,
    title: `${input.catalog.name} | ${offeringPhrase} in ${location}`,
    description: `${input.catalog.name} publishes ${offeringPhrase} service facts for ${location}. Compare details and send a qualified inquiry where available.`,
    h1: input.catalog.name,
    canonicalUrl,
    indexDirective: 'index',
    jsonLd: [
      buildLocalBusinessJsonLd(input.catalog.name, input.catalog.category, location, canonicalUrl),
      ...input.catalog.offerings.map((offering) => buildOfferingJsonLd(offering, location, canonicalUrl)),
      buildBreadcrumbJsonLd(input.catalog.name, canonicalBaseUrl, canonicalUrl),
    ],
  }
}

function buildLocalBusinessJsonLd(
  name: string,
  category: string,
  location: string,
  canonicalUrl: string
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${canonicalUrl}#business`,
    name,
    url: canonicalUrl,
    description: `${category} service catalog for ${location}`,
    areaServed: location,
  }
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

