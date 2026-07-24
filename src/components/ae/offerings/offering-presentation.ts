import type {
  ExternalOperationAccessPathDescriptor,
  PublicAccessPath,
  PublicOfferingSupplyProjection,
} from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

export type PublicOfferingSupplyView = Readonly<{
  offerings: readonly PublicOfferingSupplyProjection[]
  disposition: 'current' | 'partial' | 'stale'
  observedAt: number
}>

export function offeringApiDtoToSupplyView(dto: PublicBusinessCatalogApiV2Dto): PublicOfferingSupplyView {
  return {
    disposition: dto.disposition,
    observedAt: dto.observedAt,
    offerings: dto.offerings.map((item) => ({
      offering: {
        offeringRef: item.offeringRef as never,
        revision: item.revision,
        name: item.name,
        category: item.category,
        summary: item.summary,
        ...(item.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: item.serviceAreaSummary }),
        ...(item.availabilitySummary === undefined ? {} : { availabilitySummary: item.availabilitySummary }),
        ...(item.pricingSummary === undefined ? {} : { pricingSummary: item.pricingSummary }),
      },
      accessPaths: item.accessPaths.map((path) => ({
        accessPathRef: path.accessPathRef as never,
        descriptor: path.kind === 'human_request'
          ? {
              kind: 'human_request' as const,
              channel: path.channel,
              disclosure: path.disclosure,
              ...(path.url === undefined ? {} : { url: path.url }),
            }
          : {
              kind: 'external_operation' as const,
              name: path.name,
              summary: path.summary,
              url: path.url,
              ...(path.method === undefined ? {} : { method: path.method }),
              ...(path.documentationUrl === undefined ? {} : { documentationUrl: path.documentationUrl }),
              ...(path.interfaceDescription === undefined ? {} : { interfaceDescription: path.interfaceDescription }),
              ...(path.authenticationSummary === undefined ? {} : { authenticationSummary: path.authenticationSummary }),
              ...(path.pricingSummary === undefined ? {} : { pricingSummary: path.pricingSummary }),
              provenance: path.provenance,
            },
      })),
      support: {
        integrated: item.support.integrated,
        routeable: item.support.aeSupportedAction,
        reasons: item.support.aeSupportedAction
          ? []
          : item.support.integrated ? ['readiness_unavailable'] : ['not_integrated'],
        ...(item.support.observedAt === undefined ? {} : { observedAt: item.support.observedAt }),
        ...(item.support.validUntil === undefined ? {} : { validUntil: item.support.validUntil }),
      },
    })),
  }
}

export type OfferingAccessPresentation = Readonly<{
  accessPathRef: string
  label: string
  detail: string
  href?: string
  external: boolean
  provenance?: 'Published by the business' | 'Found in public information'
  technical?: ReadonlyArray<Readonly<{ label: string; value: string }>>
}>

export function presentOfferingAccessPath(path: PublicAccessPath): OfferingAccessPresentation {
  const descriptor = path.descriptor
  if (descriptor.kind === 'human_request') {
    return {
      accessPathRef: path.accessPathRef,
      label: humanChannelLabel(descriptor.channel),
      detail: descriptor.disclosure,
      ...(descriptor.url === undefined ? {} : { href: descriptor.url }),
      external: false,
    }
  }

  const technical = externalOperationTechnicalFacts(descriptor)
  return {
    accessPathRef: path.accessPathRef,
    label: descriptor.name,
    detail: descriptor.summary,
    href: descriptor.documentationUrl ?? descriptor.url,
    external: true,
    provenance: descriptor.provenance === 'business_declared'
      ? 'Published by the business'
      : 'Found in public information',
    ...(technical.length === 0 ? {} : { technical }),
  }
}

export function offeringSupportCopy(
  support: PublicOfferingSupplyProjection['support'],
): Readonly<{ label: string; detail: string }> | undefined {
  if (support.routeable) {
    return {
      label: 'AE can carry out this action',
      detail: support.validUntil === undefined
        ? 'This action is currently available through AE.'
        : `Available through AE until ${formatPublicDate(support.validUntil)}.`,
    }
  }
  if (!support.integrated) {
    return undefined
  }
  return {
    label: 'AE support is not available right now',
    detail: support.observedAt === undefined
      ? 'Use one of the published ways to get started instead.'
      : `Last checked ${formatPublicDate(support.observedAt)}. Use one of the published ways to get started instead.`,
  }
}

function humanChannelLabel(channel: 'phone' | 'website' | 'ae_inquiry'): string {
  switch (channel) {
    case 'phone': return 'Call'
    case 'website': return 'Website'
    case 'ae_inquiry': return 'Ask through AE'
  }
}

function externalOperationTechnicalFacts(
  descriptor: ExternalOperationAccessPathDescriptor,
): ReadonlyArray<Readonly<{ label: string; value: string }>> {
  return [
    ...(descriptor.method === undefined ? [] : [{ label: 'Method', value: descriptor.method }]),
    { label: 'Endpoint', value: descriptor.url },
    ...(descriptor.interfaceDescription === undefined
      ? []
      : [{ label: 'Interface description', value: descriptor.interfaceDescription.format }]),
    ...(descriptor.authenticationSummary === undefined
      ? []
      : [{ label: 'Authentication', value: descriptor.authenticationSummary }]),
    ...(descriptor.pricingSummary === undefined
      ? []
      : [{ label: 'Pricing', value: descriptor.pricingSummary }]),
  ]
}

function formatPublicDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(timestamp))
}
