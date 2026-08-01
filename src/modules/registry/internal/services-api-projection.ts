import type { OfferingPrice } from '@/modules/catalog/public'

import { isOpenSandboxEndpoint, sandboxCheckupQuotePathForSlug } from '@/modules/sandbox-supply/public'

import type {
  PublicBusinessCatalogApiV2Page,
  PublicOfferingAccessPathDto,
  PublicOfferingDto,
} from './offering-api-projection'

export const PublicServicesApiSchemaVersion = 'public-services-api:v1' as const

export type EndpointDto = Readonly<{
  url: string
  method?: string
  name: string
  summary: string
  pricingSummary?: string
  authenticationSummary?: string
  provenance: 'business_declared' | 'publicly_observed'
  access: 'open' | 'external'
}>

export type ServiceDto = Readonly<{
  id: string
  revision: number
  business: Readonly<{
    slug: string
    name: string
    suburb?: string
    stateTerritory?: string
  }>
  name: string
  category: string
  summary: string
  pricingSummary?: string
  price?: OfferingPrice
  availabilitySummary?: string
  observedAt?: number
  endpoints: readonly EndpointDto[]
  links: Readonly<{
    business: string
    manifest: string
  }>
}>
 
export type PublicServicesApiPage = Readonly<{
  kind: 'ok'
  schemaVersion: typeof PublicServicesApiSchemaVersion
  query?: string
  services: readonly ServiceDto[]
  pagination: PublicBusinessCatalogApiV2Page['pagination']
}>

/** Flatten one published Offering into one cold-agent service entry. */
export function projectPublicServicesPage(
  page: PublicBusinessCatalogApiV2Page,
): PublicServicesApiPage {
  return {
    kind: 'ok',
    schemaVersion: PublicServicesApiSchemaVersion,
    ...(page.query === undefined ? {} : { query: page.query }),
    services: page.items.flatMap((business) => business.offerings.map((offering) => projectService(business, offering))),
    pagination: page.pagination,
  }
}

function projectService(
  business: PublicBusinessCatalogApiV2Page['items'][number],
  offering: PublicOfferingDto,
): ServiceDto {
  const suburb = optionalText(business.suburb)
  const stateTerritory = optionalText(business.stateTerritory)
  const availabilitySummary = optionalText(offering.availabilitySummary ?? '')
  const observedAt = offering.support.observedAt

  return {
    id: offering.offeringRef,
    revision: offering.revision,
    business: {
      slug: business.slug,
      name: business.name,
      ...(suburb === undefined ? {} : { suburb }),
      ...(stateTerritory === undefined ? {} : { stateTerritory }),
    },
    name: offering.name,
    category: offering.category,
    summary: offering.summary,
    ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }),
    ...(offering.price === undefined ? {} : { price: offering.price }),
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    ...(observedAt === undefined ? {} : { observedAt }),
    endpoints: offering.accessPaths.flatMap((path) =>
      path.kind === 'external_operation' ? [projectEndpoint(path, business.slug)] : []),
    links: {
      business: `/api/businesses/${business.slug}`,
      manifest: `/${business.slug}/ucp`,
    },
  }
}


function projectEndpoint(
  path: Extract<PublicOfferingAccessPathDto, { kind: 'external_operation' }>,
  businessSlug: string,
): EndpointDto {
  const open = isOpenSandboxEndpoint(path.url, businessSlug, path.method)
  return {
    // Open endpoints are served by AE itself; emit the origin-relative URL so
    // the callable path is correct on every deployment of this catalog.
    url: open ? sandboxCheckupQuotePathForSlug(businessSlug) : path.url,
    ...(path.method === undefined ? {} : { method: path.method }),
    name: path.name,
    summary: path.summary,
    ...(path.pricingSummary === undefined ? {} : { pricingSummary: path.pricingSummary }),
    ...(path.authenticationSummary === undefined ? {} : { authenticationSummary: path.authenticationSummary }),
    provenance: path.provenance,
    access: open ? 'open' : 'external',
  }
}


function optionalText(value: string): string | undefined {
  return value.trim().length === 0 ? undefined : value
}
