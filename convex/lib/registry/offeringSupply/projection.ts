import { type Infer } from 'convex/values'
import type { OfferingPage, OfferingSupplyDto } from './reads'
import { offeringBusinessDto } from './contracts'

type ConvexOfferingAccessPathDto = Infer<typeof offeringBusinessDto>['offerings'][number]['accessPaths'][number]
type ConvexOfferingDto = Infer<typeof offeringBusinessDto>['offerings'][number]
type ConvexOfferingBusinessDto = Infer<typeof offeringBusinessDto>

export function nativeOfferingPageResultValue(page: OfferingPage) { return { kind: 'ok' as const, schemaVersion: 'public-business-catalog-api:v2' as const, page: page.items.map(toConvexOfferingBusiness), isDone: page.isDone, continueCursor: page.continueCursor } }

function toConvexOfferingAccessPath(path: OfferingSupplyDto['offerings'][number]['accessPaths'][number]): ConvexOfferingAccessPathDto {
  if (path.kind === 'human_request') {
    return {
      accessPathRef: path.accessPathRef,
      offeringRevision: path.offeringRevision,
      kind: 'human_request',
      channel: path.channel,
      disclosure: path.disclosure,
      ...(path.url === undefined ? {} : { url: path.url }),
    }
  }
  const interfaceDescription = path.interfaceDescription === undefined ? undefined : { format: path.interfaceDescription.format, ...(path.interfaceDescription.url === undefined ? {} : { url: path.interfaceDescription.url }) }
  return {
    accessPathRef: path.accessPathRef,
    offeringRevision: path.offeringRevision,
    kind: 'external_operation',
    name: path.name,
    summary: path.summary,
    url: path.url,
    ...(path.method === undefined ? {} : { method: path.method }),
    ...(path.documentationUrl === undefined ? {} : { documentationUrl: path.documentationUrl }),
    ...(interfaceDescription === undefined ? {} : { interfaceDescription }),
    ...(path.authenticationSummary === undefined ? {} : { authenticationSummary: path.authenticationSummary }),
    ...(path.pricingSummary === undefined ? {} : { pricingSummary: path.pricingSummary }),
    provenance: path.provenance,
  }
}

function toConvexOffering(offering: OfferingSupplyDto['offerings'][number]): ConvexOfferingDto {
  const price = offering.price === undefined ? undefined : { ...offering.price }
  return { offeringRef: offering.offeringRef, revision: offering.revision, name: offering.name, category: offering.category, summary: offering.summary, ...(offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: offering.serviceAreaSummary }), ...(offering.availabilitySummary === undefined ? {} : { availabilitySummary: offering.availabilitySummary }), ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }), ...(price === undefined ? {} : { price }), accessPaths: offering.accessPaths.map(toConvexOfferingAccessPath), support: { integrated: offering.support.integrated, aeSupportedAction: offering.support.aeSupportedAction, ...(offering.support.observedAt === undefined ? {} : { observedAt: offering.support.observedAt }), ...(offering.support.validUntil === undefined ? {} : { validUntil: offering.support.validUntil }) } }
}

export function toConvexOfferingBusiness(item: OfferingSupplyDto): ConvexOfferingBusinessDto {
  return {
    schemaVersion: item.schemaVersion,
    businessId: item.businessId,
    slug: item.slug,
    name: item.name,
    category: item.category,
    businessContext: item.businessContext,
    publicUrl: item.publicUrl,
    trustTier: item.trustTier,
    ...(item.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: item.responseTimeMinutes }),
    photos: item.photos.map((photo) => ({ url: photo.url, alt: photo.alt })),
    observedAt: item.observedAt,
    disposition: item.disposition,
    offerings: item.offerings.map(toConvexOffering),
    accessSummary: {
      humanRequest: item.accessSummary.humanRequest,
      externalOperation: item.accessSummary.externalOperation,
      aeSupportedAction: item.accessSummary.aeSupportedAction,
    },
  }
}

