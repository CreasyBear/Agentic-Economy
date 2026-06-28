import type { PublicServiceContract } from '@/modules/catalog/public'
import type { BuildPublicBusinessSeoInput, PublicBusinessSeoContract } from '@/modules/seo/public'
import type { JsonLdObject } from './json-ld'

export function buildPublicBusinessSeo(input: BuildPublicBusinessSeoInput): PublicBusinessSeoContract {
  const canonicalBaseUrl = trimTrailingSlash(input.options?.canonicalBaseUrl ?? 'https://ae.example')
  const canonicalUrl = `${canonicalBaseUrl}/${input.catalog.slug}`
  const primaryService = input.catalog.services.at(0)
  const servicePhrase = primaryService?.name ?? input.catalog.category
  const location = `${input.catalog.suburb}, ${input.catalog.stateTerritory}`

  return {
    slug: input.catalog.slug,
    title: `${input.catalog.name} | ${servicePhrase} in ${location}`,
    description: `${input.catalog.name} publishes ${servicePhrase} service facts for ${location}. Bookings, payments, and automated actions are not live.`,
    h1: input.catalog.name,
    canonicalUrl,
    indexDirective: 'index',
    jsonLd: [
      buildLocalBusinessJsonLd(input.catalog.name, input.catalog.category, location, canonicalUrl),
      ...input.catalog.services.map((service) => buildServiceJsonLd(service, canonicalUrl)),
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

function buildServiceJsonLd(service: PublicServiceContract, canonicalUrl: string): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${canonicalUrl}#service-${service.serviceSlug}`,
    name: service.name,
    serviceType: service.category,
    description: service.summary,
    areaServed: service.serviceArea,
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '')
}
