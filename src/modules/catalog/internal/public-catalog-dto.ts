import type {
  BuildPublicCatalogInput,
  BuildPublicCatalogResult,
  CatalogSourceState,
  PublicCatalogContract,
  PublicServiceContract,
  ServiceCapabilityContract,
} from '@/modules/catalog/public'

export function createEmptyCatalogSourceState(): CatalogSourceState {
  return {
    businessServices: [],
    serviceCapabilities: [],
  }
}

export function buildPublicCatalogDto(input: BuildPublicCatalogInput): BuildPublicCatalogResult {
  if (input.business.publicStatus !== 'published') {
    return { kind: 'hidden', reason: 'not_published' }
  }

  const services = input.services
    .filter((service) => service.status === 'published')
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((service): PublicServiceContract => {
      const capabilities = input.capabilities
        .filter((capability) => capability.serviceId === service.serviceId)
        .map((capability): ServiceCapabilityContract => {
          const base = {
            serviceId: capability.serviceId,
            kind: capability.kind,
            status: capability.status,
            firstRequest: capability.firstRequest,
            callable: false as const,
            paymentRequired: false as const,
            sourceHash: capability.sourceHash,
          }

          return capability.reason === undefined ? base : { ...base, reason: capability.reason }
        })

      const firstCapability = capabilities.at(0)
      const fallbackFirstRequest = input.capabilities.find((capability) => capability.serviceId === service.serviceId)?.firstRequest
      const firstRequest = firstCapability?.firstRequest ?? fallbackFirstRequest

      if (firstRequest === undefined) {
        throw new Error('Published services require first-request disclosure.')
      }

      return {
        serviceId: service.serviceId,
        serviceSlug: service.serviceSlug,
        businessId: service.businessId,
        name: service.name,
        category: service.category,
        summary: service.summary,
        serviceArea: service.serviceArea,
        hoursOrUnknown: service.hoursOrUnknown,
        firstRequest,
        status: 'published',
        capabilities,
        sourceHash: service.sourceHash,
      }
    })

  if (services.length === 0) {
    return { kind: 'hidden', reason: 'no_published_services' }
  }

  const catalog: PublicCatalogContract = {
    businessId: input.business.businessId,
    slug: input.business.slug,
    name: input.business.name,
    category: input.context.category,
    suburb: input.context.suburb,
    stateTerritory: input.context.stateTerritory,
    ...(input.context.postcode === undefined ? {} : { postcode: input.context.postcode }),
    publicUrl: `/${input.business.slug}`,
    publicStatus: 'published',
    trustTier: input.business.trustTier,
    indexStatus: input.indexStatus,
    discoveryStatus: input.discoveryStatus,
    services,
    sourceHash: input.business.sourceHash,
    schemaVersion: 'public-catalog:v1',
    updatedAt: input.business.updatedAt,
  }

  return { kind: 'available', catalog }
}
