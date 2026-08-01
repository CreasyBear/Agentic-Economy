import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { LOCAL_E2E_BUSINESS_FIXTURES } from '@/lib/dev/local-e2e-business-fixtures'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'
import type {
  DiscoveryManifestCapabilityContract,
  DiscoveryManifestContract,
} from '@/modules/discovery/public'
import { PUBLIC_INQUIRY_UNAVAILABLE_REASON } from '@/modules/inquiries/public-copy'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogDetailResult,
  PublicBusinessCatalogV2DetailResult,
  PublicOfferingAccessPathDto,
  PublicOfferingDto,
} from '@/modules/registry/public'

type InquiryCapabilityKind = 'phone_inquiry' | 'quote_request'

const InquiryCapabilityKinds = ['phone_inquiry', 'quote_request'] as const satisfies readonly InquiryCapabilityKind[]

/** `inquiries:readPublicCatalogInquiryAvailability` refuses more than this per read. */
const MaxInquiryAvailabilityTargetsPerRead = 100

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

/**
 * Local development has no Convex admission source. Reading `[]` there means
 * "nothing is admitted", which silently withheld the inquiry path from every
 * local surface — including the one fixture that exists precisely to model an
 * admitted business. Resolve admission from the fixture set instead, so local
 * behavior matches the fact the fixture declares.
 */
const defaultDependencies: ProjectionDependencies = {
  readAvailability: async (targets) => {
    if (isLocalE2EAuthBypassEnabled()) {
      return targets.map((target) => ({
        ...target,
        admitted: LOCAL_E2E_BUSINESS_FIXTURES.some((fixture) =>
          fixture.requestedSlug === target.businessSlug
          && fixture.inquiryAdmission === 'admitted'),
      }))
    }
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

export async function projectCurrentDiscoveryInquiryAvailability(
  manifest: DiscoveryManifestContract,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<DiscoveryManifestContract> {
  const targets = manifest.services.flatMap((service) => service.capabilities.flatMap(
    (capability): InquiryAvailabilityTarget[] => {
      const capabilityKind = inquiryCapabilityKind(capability.firstRequest.mode)
      return capabilityKind === undefined ? [] : [{
        businessSlug: manifest.slug,
        serviceSlug: service.slug,
        capabilityKind,
      }]
    },
  ))
  if (targets.length === 0) return manifest
  const availability = await dependencies.readAvailability(targets)
  const admitted = admittedAvailabilityKeys(availability)
  const services = manifest.services.map((service) => ({
    ...service,
    capabilities: service.capabilities.map((capability) => {
      const capabilityKind = inquiryCapabilityKind(capability.firstRequest.mode)
      if (capabilityKind === undefined || admitted.has(availabilityKey({
        businessSlug: manifest.slug,
        serviceSlug: service.slug,
        capabilityKind,
      }))) return capability
      return unavailableManifestCapability(capability)
    }),
  }))
  const unchanged = services.length === manifest.services.length && services.every((service, serviceIndex) => {
    const currentCapabilities = manifest.services[serviceIndex]?.capabilities
    return currentCapabilities !== undefined
      && service.capabilities.length === currentCapabilities.length
      && service.capabilities.every(
        (capability, capabilityIndex) => capability === currentCapabilities[capabilityIndex],
      )
  })
  if (unchanged) return manifest
  return rebindDiscoveryManifest(manifest, services)
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

function unavailableManifestCapability(
  capability: DiscoveryManifestCapabilityContract,
): DiscoveryManifestCapabilityContract {
  return {
    ...capability,
    status: 'unavailable',
    firstRequest: {
      mode: 'not_available_yet',
      publicDisclosure: PUBLIC_INQUIRY_UNAVAILABLE_REASON,
      publicChannel: 'not_available',
      noContactReason: PUBLIC_INQUIRY_UNAVAILABLE_REASON,
    },
  }
}

function rebindDiscoveryManifest(
  manifest: DiscoveryManifestContract,
  services: DiscoveryManifestContract['services'],
): DiscoveryManifestContract {
  const {
    bodyHash: _bodyHash,
    generatedHash: _generatedHash,
    generatedAt,
    urlHash: _urlHash,
    ...currentBody
  } = manifest
  const body = { ...currentBody, services }
  const bodyHash = stableHash(body as StableHashValue)
  const urlHash = stableHash({ urls: manifest.routes.map(({ url }) => url) })
  const generatedHash = stableHash({
    bodyHash,
    sourceHash: manifest.sourceHash,
    sourceVersion: manifest.sourceVersion,
    urlHash,
  })
  return { ...body, generatedHash, bodyHash, urlHash, generatedAt }
}

/**
 * Offering-supply (v2) counterpart of the service overlay above.
 *
 * An `ae_inquiry` access path is the public claim that AE will carry a first
 * contact for that offering. Admission is a current source fact, so the claim
 * is re-checked on every read and the path is dropped when the source will not
 * accept an inquiry. Phone, website and external-operation paths are the
 * business's own reachability and are never touched here.
 */
export async function projectCurrentOfferingInquiryAvailability(
  business: PublicBusinessCatalogApiV2Dto,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<PublicBusinessCatalogApiV2Dto> {
  const targets = offeringInquiryTargets(business)
  if (targets.length === 0) return business
  return applyOfferingInquiryAdmission(business, await readAdmittedKeys(dependencies, targets))
}

export async function projectCurrentOfferingInquiryPage(
  page: PublicBusinessCatalogApiV2Page,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<PublicBusinessCatalogApiV2Page> {
  const targets = page.items.flatMap(offeringInquiryTargets)
  if (targets.length === 0) return page
  const admitted = await readAdmittedKeys(dependencies, targets)
  return { ...page, items: page.items.map((business) => applyOfferingInquiryAdmission(business, admitted)) }
}

export async function projectCurrentOfferingInquiryDetail(
  detail: PublicBusinessCatalogV2DetailResult,
  dependencies: ProjectionDependencies = defaultDependencies,
): Promise<PublicBusinessCatalogV2DetailResult> {
  return detail.kind === 'not_found'
    ? detail
    : {
        ...detail,
        business: await projectCurrentOfferingInquiryAvailability(detail.business, dependencies),
      }
}

function isAeInquiryAccessPath(path: PublicOfferingAccessPathDto): boolean {
  return path.kind === 'human_request' && path.channel === 'ae_inquiry'
}

/**
 * The admission key an offering's `ae_inquiry` path must be checked under, or
 * `undefined` when the offering has no such path or carries no service slug.
 *
 * The admission source is keyed by service slug, and only the legacy migration
 * adapter carries one into an Offering identity, as
 * `legacy-offering:{businessSlug}:{serviceSlug}`. A natively projected offering
 * ref (`offering:{serviceId}`, or an owner-authored ref) carries a source
 * document id or nothing at all, and the v2 DTO exposes no other service-slug
 * field, so there is no admission key for those offerings. They are left
 * unevaluated rather than answered against a fabricated key. Both the target
 * pass and the apply pass resolve the key here so they cannot disagree.
 */
function admissionServiceSlug(
  business: PublicBusinessCatalogApiV2Dto,
  offering: PublicOfferingDto,
): string | undefined {
  if (!offering.accessPaths.some(isAeInquiryAccessPath)) return undefined
  const prefix = `legacy-offering:${business.slug}:`
  return offering.offeringRef.startsWith(prefix) && offering.offeringRef.length > prefix.length
    ? offering.offeringRef.slice(prefix.length)
    : undefined
}

function offeringInquiryTargets(business: PublicBusinessCatalogApiV2Dto): InquiryAvailabilityTarget[] {
  const targets: InquiryAvailabilityTarget[] = []
  const seen = new Set<string>()
  for (const offering of business.offerings) {
    const serviceSlug = admissionServiceSlug(business, offering)
    if (serviceSlug === undefined) continue
    for (const capabilityKind of InquiryCapabilityKinds) {
      const target = { businessSlug: business.slug, serviceSlug, capabilityKind }
      const key = availabilityKey(target)
      if (seen.has(key)) continue
      seen.add(key)
      targets.push(target)
    }
  }
  return targets
}

/**
 * The v2 access path is channel-shaped, not capability-shaped: the legacy
 * adapter folds both `inquiry_available` (phone_inquiry) and
 * `quote_request_available` (quote_request) into one `ae_inquiry` path. The
 * path therefore survives when the service can currently receive at least one
 * inquiry kind, and is dropped when it can receive none.
 */
function applyOfferingInquiryAdmission(
  business: PublicBusinessCatalogApiV2Dto,
  admitted: ReadonlySet<string>,
): PublicBusinessCatalogApiV2Dto {
  const offerings = business.offerings.map((offering) => {
    const serviceSlug = admissionServiceSlug(business, offering)
    if (serviceSlug === undefined) return offering
    const reachable = InquiryCapabilityKinds.some((capabilityKind) => admitted.has(availabilityKey({
      businessSlug: business.slug,
      serviceSlug,
      capabilityKind,
    })))
    return reachable
      ? offering
      : { ...offering, accessPaths: offering.accessPaths.filter((path) => !isAeInquiryAccessPath(path)) }
  })
  if (offerings.every((offering, index) => offering === business.offerings[index])) return business
  return {
    ...business,
    offerings,
    accessSummary: {
      ...business.accessSummary,
      humanRequest: offerings.some((offering) => offering.accessPaths.some((path) => path.kind === 'human_request')),
    },
  }
}

async function readAdmittedKeys(
  dependencies: ProjectionDependencies,
  targets: readonly InquiryAvailabilityTarget[],
): Promise<ReadonlySet<string>> {
  const admitted = new Set<string>()
  for (let start = 0; start < targets.length; start += MaxInquiryAvailabilityTargetsPerRead) {
    const availability = await dependencies.readAvailability(
      targets.slice(start, start + MaxInquiryAvailabilityTargetsPerRead),
    )
    for (const item of availability) {
      if (item.admitted) admitted.add(availabilityKey(item))
    }
  }
  return admitted
}
