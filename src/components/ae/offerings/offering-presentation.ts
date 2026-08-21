import type {
  ExternalOperationAccessPathDescriptor,
  PublicAccessPath,
  PublicOfferingSupplyProjection,
} from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { formatDate } from '@/lib/ui/format-time'

export type PublicOfferingAccessPathView = Readonly<{
  accessPathRef: PublicAccessPath['accessPathRef']
  offeringRevision: PublicAccessPath['offeringRevision']
  descriptor: PublicAccessPath['descriptor']
}>

export type PublicOfferingSupplyProjectionView = Readonly<
  Omit<PublicOfferingSupplyProjection, 'accessPaths'> & {
    accessPaths: readonly PublicOfferingAccessPathView[]
  }
>

export type PublicOfferingSupplyView = Readonly<{
  offerings: readonly PublicOfferingSupplyProjectionView[]
  disposition: 'current' | 'partial' | 'stale'
  observedAt: number
}>

export function offeringApiDtoToSupplyView(dto: PublicBusinessCatalogApiV2Dto): PublicOfferingSupplyView {
  return {
    disposition: dto.disposition,
    observedAt: dto.observedAt,
    offerings: dto.offerings.map((item) => ({
      offering: {
        offeringRef: brandNonEmpty(item.offeringRef, 'OfferingRef'),
        revision: item.revision,
        name: item.name,
        category: item.category,
        summary: item.summary,
        ...(item.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: item.serviceAreaSummary }),
        ...(item.availabilitySummary === undefined ? {} : { availabilitySummary: item.availabilitySummary }),
        ...(item.pricingSummary === undefined ? {} : { pricingSummary: item.pricingSummary }),
        ...(item.price === undefined ? {} : { price: item.price }),
      },
      accessPaths: item.accessPaths.map((path) => ({
        accessPathRef: brandNonEmpty(path.accessPathRef, 'AccessPathRef'),
        offeringRevision: path.offeringRevision,
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

export function plainLanguageCopy(value: string): string {
  return value
    .replace(/\bpublished offering\b/giu, 'published service')
    .replace(/\b(?:labelled\s+)?sandbox provider\b/giu, 'demo provider')
    .replace(/\bsandbox\b/giu, 'demo')
    .replace(/\bcapabilities?\b/giu, 'service options')
    .replace(/\bprovenance\b/giu, 'source')
    .replace(/\bendpoint\b/giu, 'web address')
    .replace(/\bslugs?\b/giu, 'page address')
    .replace(/\brevisions?\b/giu, 'version')
}


export type OfferingAccessPresentation = Readonly<{
  accessPathRef: string
  label: string
  detail: string
  href?: string
  external: boolean
  provenance?: 'Published by the business' | 'Found in public information'
  price?: string
  technical?: ReadonlyArray<Readonly<{ label: string; value: string }>>
}>

export function presentOfferingAccessPath(path: PublicOfferingAccessPathView): OfferingAccessPresentation {
  const descriptor = path.descriptor
  if (descriptor.kind === 'human_request') {
    return {
      accessPathRef: path.accessPathRef,
      label: humanChannelLabel(descriptor.channel),
      detail: plainLanguageCopy(descriptor.disclosure),
      ...(descriptor.url === undefined ? {} : { href: descriptor.url }),
      external: false,
    }
  }

  const technical = externalOperationTechnicalFacts(descriptor)
  return {
    accessPathRef: path.accessPathRef,
    label: plainLanguageCopy(descriptor.name),
    detail: plainLanguageCopy(descriptor.summary),
    href: descriptor.documentationUrl ?? descriptor.url,
    external: true,
    provenance: descriptor.provenance === 'business_declared'
      ? 'Published by the business'
      : 'Found in public information',
    ...(descriptor.pricingSummary === undefined ? {} : { price: descriptor.pricingSummary }),
    ...(technical.length === 0 ? {} : { technical }),
  }
}

export function offeringSupportCopy(
  support: PublicOfferingSupplyProjection['support'],
): Readonly<{ label: string; detail: string }> | undefined {
  if (support.routeable) {
    return {
      label: 'An AI assistant can start this service',
      detail: support.validUntil === undefined
        ? 'An assistant can send this request now.'
        : `An assistant can send this request until ${formatDate(support.validUntil)}.`,
    }
  }
  if (!support.integrated) {
    return undefined
  }
  return {
    label: 'An AI assistant cannot start this service right now',
    detail: support.observedAt === undefined
      ? 'Use the phone or website listed above instead.'
      : `Last checked ${formatDate(support.observedAt)}. Use the phone or website listed above instead.`,
  }
}

function humanChannelLabel(channel: 'phone' | 'website'): string {
  switch (channel) {
    case 'phone': return 'Call'
    case 'website': return 'Website'
    default: {
      const _exhaustive: never = channel
      return _exhaustive
    }
  }
}

function externalOperationTechnicalFacts(
  descriptor: ExternalOperationAccessPathDescriptor,
): ReadonlyArray<Readonly<{ label: string; value: string }>> {
  return [
    ...(descriptor.method === undefined ? [] : [{ label: 'Method', value: descriptor.method }]),
    { label: 'Web address', value: descriptor.url },
    ...(descriptor.interfaceDescription === undefined
      ? []
      : [{ label: 'Interface description', value: descriptor.interfaceDescription.format }]),
    ...(descriptor.authenticationSummary === undefined
      ? []
      : [{ label: 'Authentication', value: descriptor.authenticationSummary }]),
  ]
}

