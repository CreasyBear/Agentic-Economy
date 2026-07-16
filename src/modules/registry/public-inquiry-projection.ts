import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { PUBLIC_INQUIRY_UNAVAILABLE_REASON } from '@/modules/inquiries/public-copy'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
} from '@/modules/registry/public'

type InquiryCapabilityKind = 'phone_inquiry' | 'quote_request'

type InquiryAvailabilityTarget = {
    businessSlug: string
    serviceSlug: string
    capabilityKind: InquiryCapabilityKind
}

type InquiryAvailability = InquiryAvailabilityTarget & { admitted: boolean }

type ProjectionDependencies = {
  readAvailability: (targets: readonly InquiryAvailabilityTarget[]) => Promise<readonly InquiryAvailability[]>
}

const readPublicCatalogInquiryAvailabilityQuery = sourceQuery<
  { targets: readonly InquiryAvailabilityTarget[] },
  readonly InquiryAvailability[]
>('inquiries:readPublicCatalogInquiryAvailability')

const defaultDependencies: ProjectionDependencies = {
  readAvailability: async (targets) => {
    try {
      return await callPublicSourceQuery(readPublicCatalogInquiryAvailabilityQuery, { targets })
    } catch {
      return []
    }
  },
}

export async function projectCurrentPublicInquiryAvailability(
  business: PublicBusinessCatalogApiDto,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<PublicBusinessCatalogApiDto> {
  const targets = business.services.flatMap((service): InquiryAvailabilityTarget[] => {
    const capabilityKind = inquiryCapabilityKind(service.firstRequest.mode)
    return capabilityKind === undefined ? [] : [{
      businessSlug: business.slug,
      serviceSlug: service.slug,
      capabilityKind,
    }]
  })
  if (targets.length === 0) return business
  const availability = await dependencies.readAvailability(targets)
  const admitted = admittedAvailabilityKeys(availability)
  const services = business.services.map((service) => {
    const capabilityKind = inquiryCapabilityKind(service.firstRequest.mode)
    if (capabilityKind === undefined) return service
    return admitted.has(availabilityKey({
      businessSlug: business.slug,
      serviceSlug: service.slug,
      capabilityKind,
    }))
      ? service
      : unavailableService(service, capabilityKind)
  })

  return services.every((service, index) => service === business.services[index])
    ? business
    : { ...business, services }
}

export async function projectCurrentPublicInquiryPage(
  page: PublicBusinessCatalogApiPage,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<PublicBusinessCatalogApiPage> {
  const targets = page.items.flatMap((business) => business.services.flatMap((service): InquiryAvailabilityTarget[] => {
    const capabilityKind = inquiryCapabilityKind(service.firstRequest.mode)
    return capabilityKind === undefined ? [] : [{
      businessSlug: business.slug,
      serviceSlug: service.slug,
      capabilityKind,
    }]
  }))
  const availability = targets.length === 0 ? [] : await dependencies.readAvailability(targets)
  const admitted = admittedAvailabilityKeys(availability)
  return {
    ...page,
    items: page.items.map((business) => ({
      ...business,
      services: business.services.map((service) => {
        const capabilityKind = inquiryCapabilityKind(service.firstRequest.mode)
        if (capabilityKind === undefined) return service
        return admitted.has(availabilityKey({
          businessSlug: business.slug,
          serviceSlug: service.slug,
          capabilityKind,
        })) ? service : unavailableService(service, capabilityKind)
      }),
    })),
  }
}

function availabilityKey(target: InquiryAvailabilityTarget): string {
  return `${target.businessSlug}\u0000${target.serviceSlug}\u0000${target.capabilityKind}`
}

function admittedAvailabilityKeys(availability: readonly InquiryAvailability[]): Set<string> {
  const admitted = new Set<string>()
  for (const item of availability) {
    if (item.admitted) admitted.add(availabilityKey(item))
  }
  return admitted
}

export async function projectCurrentPublicInquiryDetail(
  detail: PublicBusinessCatalogDetailResult,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<PublicBusinessCatalogDetailResult> {
  return detail.kind === 'not_found'
    ? detail
    : {
        ...detail,
        business: await projectCurrentPublicInquiryAvailability(detail.business, dependencies),
      }
}

function inquiryCapabilityKind(
  mode: PublicBusinessCatalogApiDto['services'][number]['firstRequest']['mode'],
): InquiryCapabilityKind | undefined {
  if (mode === 'inquiry_available') return 'phone_inquiry'
  if (mode === 'quote_request_available') return 'quote_request'
  return undefined
}

function unavailableService(
  service: PublicBusinessCatalogApiDto['services'][number],
  capabilityKind: InquiryCapabilityKind,
): PublicBusinessCatalogApiDto['services'][number] {
  return {
    ...service,
    firstRequest: {
      mode: 'not_available_yet',
      publicDisclosure: PUBLIC_INQUIRY_UNAVAILABLE_REASON,
      publicChannel: 'not_available',
      noContactReason: PUBLIC_INQUIRY_UNAVAILABLE_REASON,
    },
    capabilities: service.capabilities.map((capability) =>
      capability.kind === capabilityKind
        ? { ...capability, status: 'unavailable' as const }
        : capability),
  }
}
