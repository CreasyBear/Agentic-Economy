import type { OfferingPrice } from '@/modules/catalog/public'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicOfferingDto,
} from '@/modules/registry/public'

export type ManifestOfferingProjection = Readonly<{
  offeringRef: string
  revision: number
  name: string
  category: string
  summary: string
  serviceAreaSummary?: string
  availabilitySummary?: string
  pricingSummary?: string
  price?: OfferingPrice
}>

export type ManifestCatalogProjection<TOffering> = Readonly<{
  businessId: string
  slug: string
  businessName: string
  category: string
  location: Readonly<{
    suburb: string
    stateTerritory: string
    postcode?: string
  }>
  offerings: readonly TOffering[]
}>

type ManifestOfferingProjector<TOffering> = (
  offering: PublicOfferingDto,
  projection: ManifestOfferingProjection,
) => TOffering

export function projectManifestCatalog<TOffering>(
  catalog: PublicBusinessCatalogApiV2Dto,
  projectOffering: ManifestOfferingProjector<TOffering>,
): ManifestCatalogProjection<TOffering> {
  return {
    businessId: catalog.businessId,
    slug: catalog.slug,
    businessName: safePublicText(catalog.name),
    category: safePublicText(catalog.category),
    location: {
      suburb: safePublicText(catalog.suburb),
      stateTerritory: safePublicText(catalog.stateTerritory),
      ...(catalog.postcode === undefined ? {} : { postcode: safePublicText(catalog.postcode) }),
    },
    offerings: catalog.offerings.map((offering) => projectOffering(offering, {
      offeringRef: offering.offeringRef,
      revision: offering.revision,
      name: safePublicText(offering.name),
      category: safePublicText(offering.category),
      summary: safePublicText(offering.summary),
      ...(offering.serviceAreaSummary === undefined
        ? {}
        : { serviceAreaSummary: safePublicText(offering.serviceAreaSummary) }),
      ...(offering.availabilitySummary === undefined
        ? {}
        : { availabilitySummary: safePublicText(offering.availabilitySummary) }),
      ...(offering.pricingSummary === undefined
        ? {}
        : { pricingSummary: safePublicText(offering.pricingSummary) }),
      ...(offering.price === undefined ? {} : { price: offering.price }),
    })),
  }
}

export function safePublicText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ')
    .replace(/javascript\s*:/giu, 'blocked-uri ')
    .replace(/ignore previous instructions/giu, 'untrusted instruction')
    .replace(/[`*_#>\[\]()]/gu, ' ')
    .replace(/\bendpoint\b/giu, 'untrusted claim')
    .replace(/\b(?:verified|callable|payable)\b/giu, 'untrusted claim')
    .replace(/\b(?:checked|authority|price|booking|dispatch|action)\b/giu, 'untrusted claim')
    .replace(/paymentRequired\s*[:=]\s*true/giu, 'untrusted claim')
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .trim()
    .slice(0, 500)
}
