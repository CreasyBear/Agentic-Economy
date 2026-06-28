import { claimBusiness, createEmptyBusinessSourceState, isPubliclyDiscoverable } from '@/modules/business/public'
import { buildPublicCatalogDto, createEmptyCatalogSourceState, publishBusinessCatalog } from '@/modules/catalog/public'
import type {
  FirstRequestMode,
  PublicCatalogContract,
  PublicFirstRequestChannel,
  ServiceCatalogInput,
} from '@/modules/catalog/public'
import { publicOwnerDefaultClaimInput } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, CorrelationId, OperationKey, Slug } from '@/modules/common/ids'
import type { IndexStatus, RegistrySourceState } from '@/modules/registry/public'

const apiSchemaVersion = 'public-business-catalog-api:v1' as const
const defaultLimit = 20
const maxLimit = 50

export type PublicBusinessCatalogQueryInput = {
  cursor?: string
  limit?: number
}

export type PublicBusinessCatalogSearchInput = PublicBusinessCatalogQueryInput & {
  query: string
}

export type PublicBusinessCatalogApiDto = {
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  postcode?: string
  publicUrl: string
  trustTier: PublicCatalogContract['trustTier']
  publicStatus: Extract<PublicCatalogContract['publicStatus'], 'published'>
  indexStatus: IndexStatus
  discoveryStatus: PublicCatalogContract['discoveryStatus']
  schemaVersion: typeof apiSchemaVersion
  updatedAt: number
  services: readonly {
    slug: string
    name: string
    category: string
    summary: string
    serviceArea: string
    hoursOrUnknown: string
    firstRequest: {
      mode: PublicCatalogContract['services'][number]['firstRequest']['mode']
      publicDisclosure: string
      publicChannel: PublicCatalogContract['services'][number]['firstRequest']['publicChannel']
      noContactReason?: string
    }
    status: Extract<PublicCatalogContract['services'][number]['status'], 'published'>
    capabilities: readonly {
      kind: PublicCatalogContract['services'][number]['capabilities'][number]['kind']
      status: PublicCatalogContract['services'][number]['capabilities'][number]['status']
      callable: false
      paymentRequired: false
    }[]
  }[]
}

export type PublicBusinessCatalogApiPage = {
  kind: 'ok'
  schemaVersion: typeof apiSchemaVersion
  query?: string
  items: readonly PublicBusinessCatalogApiDto[]
  pagination: {
    cursor?: string
    nextCursor?: string
    limit: number
    total: number
    hasMore: boolean
  }
}

export type PublicBusinessCatalogDetailResult =
  | {
      kind: 'found'
      schemaVersion: typeof apiSchemaVersion
      business: PublicBusinessCatalogApiDto
    }
  | {
      kind: 'not_found'
      code: 'business_not_found'
      reason: string
    }

export function listPublicBusinessCatalog(
  state: RegistrySourceState,
  input: PublicBusinessCatalogQueryInput = {}
): PublicBusinessCatalogApiPage {
  return paginateCatalogs(readPublicCatalogs(state).map(toPublicApiDto), input)
}

export function searchPublicBusinessCatalog(
  state: RegistrySourceState,
  input: PublicBusinessCatalogSearchInput
): PublicBusinessCatalogApiPage {
  const query = normalizeSearchText(input.query)
  if (query.length === 0) {
    return {
      kind: 'ok',
      schemaVersion: apiSchemaVersion,
      query: '',
      items: [],
      pagination: {
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        limit: normalizeLimit(input.limit),
        total: 0,
        hasMore: false,
      },
    }
  }

  const queryTokens = query.split(' ').map(normalizeSearchToken)
  const matches = readPublicCatalogs(state)
    .filter((catalog) => matchesCatalog(catalog, queryTokens))
    .map(toPublicApiDto)

  return paginateCatalogs(matches, input, query)
}

export function getPublicBusinessCatalogBySlug(
  state: RegistrySourceState,
  input: { slug: Slug | string }
): PublicBusinessCatalogDetailResult {
  const slug = String(input.slug)
  const catalog = readPublicCatalogs(state).find((candidate) => candidate.slug === slug)

  if (catalog === undefined) {
    return {
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No public business catalog exists for this slug.',
    }
  }

  return {
    kind: 'found',
    schemaVersion: apiSchemaVersion,
    business: toPublicApiDto(catalog),
  }
}

export function createDefaultRegistrySourceState(): RegistrySourceState {
  const state: RegistrySourceState = {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    suppressionRules: [],
  }

  const claim = claimBusiness(state, {
    actor: { kind: 'authenticated_owner', clerkUserId: 'source-owned-owner-session', displayName: 'Sam' },
    facts: {
      name: publicOwnerDefaultClaimInput.businessName,
      category: publicOwnerDefaultClaimInput.category,
      suburb: publicOwnerDefaultClaimInput.suburb,
      stateTerritory: publicOwnerDefaultClaimInput.stateTerritory,
      requestedSlug: publicOwnerDefaultClaimInput.requestedSlug,
      ownerMessage: publicOwnerDefaultClaimInput.ownerMessage,
      sourceRefs: [
        {
          label: publicOwnerDefaultClaimInput.sourceLabel,
          evidenceRef: `private:evidence:${publicOwnerDefaultClaimInput.requestedSlug}`,
          sourceHash: brandNonEmpty(`hash:source:${publicOwnerDefaultClaimInput.requestedSlug}`, 'SourceHash'),
        },
      ],
    },
    security: {
      csrf: matchingCsrf('claim'),
      rateLimit: {
        scope: 'claim_submit',
        key: `registry:${publicOwnerDefaultClaimInput.requestedSlug}`,
        now: 1_000,
        limit: 5,
        windowMs: 60_000,
      },
    },
    operationKey: operationKey(`claim:${publicOwnerDefaultClaimInput.requestedSlug}`),
    correlationId: correlationId(`claim:${publicOwnerDefaultClaimInput.requestedSlug}`),
    now: 1_000,
  })

  if (claim.kind === 'error') {
    throw new Error(`Default registry claim failed: ${claim.reason}`)
  }

  const published = publishBusinessCatalog(state, {
    actor: { kind: 'authenticated_owner', clerkUserId: 'source-owned-owner-session', displayName: 'Sam' },
    claimId: claim.claim.claimId,
    services: [toServiceCatalogInput(publicOwnerDefaultClaimInput)],
    security: { csrf: matchingCsrf('publish') },
    operationKey: operationKey(`publish:${publicOwnerDefaultClaimInput.requestedSlug}`),
    correlationId: correlationId(`publish:${publicOwnerDefaultClaimInput.requestedSlug}`),
    now: 2_000,
  })

  if (published.kind === 'error') {
    throw new Error(`Default registry publish failed: ${published.reason}`)
  }

  return state
}

function readPublicCatalogs(state: RegistrySourceState): readonly PublicCatalogContract[] {
  return state.businesses
    .filter((business) => isPubliclyDiscoverable(business, state.suppressionRules))
    .map((business) => {
      const context = state.businessContexts.find((candidate) => candidate.businessId === business.businessId)
      if (context === undefined) {
        return undefined
      }

      const catalog = buildPublicCatalogDto({
        business,
        context,
        services: state.businessServices.filter((service) => service.businessId === business.businessId),
        capabilities: state.serviceCapabilities.filter((capability) => capability.businessId === business.businessId),
        indexStatus: indexStatusForBusiness(state, business.businessId),
        discoveryStatus: 'degraded',
      })

      return catalog.kind === 'available' ? catalog.catalog : undefined
    })
    .filter((catalog): catalog is PublicCatalogContract => catalog !== undefined)
    .sort(compareCatalogs)
}

function toPublicApiDto(catalog: PublicCatalogContract): PublicBusinessCatalogApiDto {
  return {
    slug: catalog.slug,
    name: catalog.name,
    category: catalog.category,
    suburb: catalog.suburb,
    stateTerritory: catalog.stateTerritory,
    ...(catalog.postcode === undefined ? {} : { postcode: catalog.postcode }),
    publicUrl: catalog.publicUrl,
    trustTier: catalog.trustTier,
    publicStatus: 'published',
    indexStatus: catalog.indexStatus,
    discoveryStatus: catalog.discoveryStatus,
    schemaVersion: apiSchemaVersion,
    updatedAt: catalog.updatedAt,
    services: catalog.services.map((service) => ({
      slug: service.serviceSlug,
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceArea: service.serviceArea,
      hoursOrUnknown: service.hoursOrUnknown,
      firstRequest: {
        mode: service.firstRequest.mode,
        publicDisclosure: service.firstRequest.publicDisclosure,
        publicChannel: service.firstRequest.publicChannel,
        ...(service.firstRequest.noContactReason === undefined
          ? {}
          : { noContactReason: service.firstRequest.noContactReason }),
      },
      status: 'published',
      capabilities: service.capabilities.map((capability) => ({
        kind: capability.kind,
        status: capability.status,
        callable: false,
        paymentRequired: false,
      })),
    })),
  }
}

function paginateCatalogs(
  items: readonly PublicBusinessCatalogApiDto[],
  input: PublicBusinessCatalogQueryInput,
  query?: string
): PublicBusinessCatalogApiPage {
  const limit = normalizeLimit(input.limit)
  const startIndex =
    input.cursor === undefined ? 0 : Math.max(items.findIndex((item) => item.slug === input.cursor) + 1, 0)
  const pageItems = items.slice(startIndex, startIndex + limit)
  const next = items.at(startIndex + limit)

  return {
    kind: 'ok',
    schemaVersion: apiSchemaVersion,
    ...(query === undefined ? {} : { query }),
    items: pageItems,
    pagination: {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(next === undefined ? {} : { nextCursor: next.slug }),
      limit,
      total: items.length,
      hasMore: next !== undefined,
    },
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return defaultLimit
  }

  return Math.min(Math.max(Math.trunc(limit), 1), maxLimit)
}

function matchesCatalog(catalog: PublicCatalogContract, queryTokens: readonly string[]): boolean {
  const haystack = normalizeSearchText(
    [
      catalog.name,
      catalog.category,
      catalog.suburb,
      catalog.stateTerritory,
      catalog.postcode ?? '',
      ...catalog.services.flatMap((service) => [
        service.name,
        service.category,
        service.summary,
        service.serviceArea,
      ]),
    ].join(' ')
  )

  return queryTokens.every((token) => haystack.includes(token))
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeSearchToken(token: string): string {
  if (token === 'plumber' || token === 'plumbers') {
    return 'plumbing'
  }

  return token
}

function indexStatusForBusiness(state: RegistrySourceState, businessId: BusinessId): IndexStatus {
  const explicit = state.indexStatus.find(
    (status) => status.targetType === 'business' && status.targetRef === businessId
  )
  if (explicit !== undefined) {
    return explicit.status
  }

  const latestAttempt = state.registryProjectionAttempts
    .filter((attempt) => attempt.businessId === businessId)
    .sort((left, right) => (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt))
    .at(0)

  if (latestAttempt?.status === 'succeeded') {
    return 'indexed'
  }

  if (latestAttempt?.status === 'failed') {
    return 'failed'
  }

  if (latestAttempt?.status === 'stale') {
    return 'stale'
  }

  if (latestAttempt?.status === 'queued') {
    return 'queued'
  }

  return 'not_queued'
}

function compareCatalogs(left: PublicCatalogContract, right: PublicCatalogContract): number {
  const byName = left.name.localeCompare(right.name)
  return byName === 0 ? left.slug.localeCompare(right.slug) : byName
}

function toServiceCatalogInput(input: {
  serviceName: string
  serviceCategory: string
  serviceSummary: string
  serviceArea: string
  hoursOrUnknown: string
  firstRequestMode: FirstRequestMode
  publicDisclosure: string
  noContactReason: string
}): ServiceCatalogInput {
  return {
    name: input.serviceName,
    category: input.serviceCategory,
    summary: input.serviceSummary,
    serviceArea: input.serviceArea,
    hoursOrUnknown: input.hoursOrUnknown,
    firstRequest:
      input.firstRequestMode === 'not_available_yet'
        ? {
            mode: input.firstRequestMode,
            publicChannel: 'not_available',
            publicDisclosure: input.publicDisclosure,
            noContactReason: input.noContactReason,
          }
        : {
            mode: input.firstRequestMode,
            publicChannel: publicChannelFor(input.firstRequestMode),
            publicDisclosure: input.publicDisclosure,
          },
  }
}

function publicChannelFor(mode: Exclude<FirstRequestMode, 'not_available_yet'>): Extract<
  PublicFirstRequestChannel,
  'public_business_contact' | 'ae_status_only'
> {
  return mode === 'quote_request_available' ? 'ae_status_only' : 'public_business_contact'
}

function matchingCsrf(key: string) {
  return {
    csrfToken: `csrf-${key}`,
    csrfCookie: `csrf-${key}`,
    allowedOrigins: ['https://ae.example'],
  }
}

function operationKey(value: string): OperationKey {
  return brandNonEmpty(`op:registry-default:${value}`, 'OperationKey')
}

function correlationId(value: string): CorrelationId {
  return brandNonEmpty(`corr:registry-default:${value}`, 'CorrelationId')
}
