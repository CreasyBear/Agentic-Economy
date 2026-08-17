import {
  claimBusiness,
  createEmptyBusinessSourceState,
} from '@/modules/business/public'
import {
  createEmptyCatalogSourceState,
  getPublicBusinessCatalog,
  publicOwnerDefaultClaimInput,
  toBusinessContext,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { matchingCsrf } from '@/modules/common/matching-csrf'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  BusinessId,
  CorrelationId,
  OfferingRef,
  OperationKey,
  Slug,
} from '@/modules/common/ids'
import { normalizeSearchText } from '@/modules/common/normalize-search-text'
import type { ExactAmount } from '@/modules/money/public'
import type { IndexStatus } from './schema-values'
import type { RegistrySourceState } from './projection-contracts'

import {
  PublicBusinessCatalogApiSchemaVersion,
  type PublicBusinessCatalogApiV2Dto,
  type PublicBusinessCatalogApiV2Page,
  type PublicBusinessCatalogApiV2SearchPage,
  type PublicBusinessCatalogV2DetailResult,
} from './offering-api-projection'
import { registrySearchTokens } from './search-documents'

const defaultLimit = 20
const maxLimit = 50

export type PublicBusinessCatalogQueryInput = {
  paginationOpts: {
    numItems: number
    cursor: string | null
  }
}

export type PublicBusinessCatalogSearchInput = {
  cursor?: string
  limit?: number
  query: string
  mode?: 'near_me' | 'whole_catalogue'
  location?: string
  maxPrice?: ExactAmount
  hasPrice?: boolean
}

export type PublishedInquiryTargetResolution =
  | { kind: 'resolved'; businessId: BusinessId; offeringRef: OfferingRef }
  | { kind: 'not_found'; reason: string }

export function listPublicBusinessOfferingSupply(
  state: RegistrySourceState,
  input: PublicBusinessCatalogQueryInput,
): PublicBusinessCatalogApiV2Page {
  return paginateCatalogs(readPublicCatalogs(state), input)
}

export function searchPublicBusinessOfferingSupply(
  state: RegistrySourceState,
  input: PublicBusinessCatalogSearchInput,
): PublicBusinessCatalogApiV2SearchPage {
  const query = normalizeSearchText(input.query)
  const tokens = registrySearchTokens(query)
  if (tokens.length === 0) {
    return {
      kind: 'ok',
      schemaVersion: PublicBusinessCatalogApiSchemaVersion,
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

  const searchableCatalogs = readPublicCatalogs(state)
  const location = input.mode === 'near_me' ? input.location : undefined
  const scopedCatalogs = location === undefined
    ? searchableCatalogs
    : searchableCatalogs.filter((item) => matchesSearchLocation(item, location))
  const matches = scopedCatalogs
    .reduce<{ item: (typeof scopedCatalogs)[number]; index: number; matches: number }[]>((acc, item, index) => {
      const matchCount = tokens.filter((token) => matchesNativeSearch(item, token)).length
      if (matchCount === tokens.length) acc.push({ item, index, matches: matchCount })
      return acc
    }, [])
    .sort((left, right) => right.matches - left.matches || left.index - right.index)
    .map(({ item }) => item)

  return paginateSearchCatalogs(matches, input, query)

}

function matchesNativeSearch(item: PublicBusinessCatalogApiV2Dto, token: string): boolean {
  const contextTerms = item.businessContext.kind === 'programmable_provider'
    ? [item.businessContext.website, item.businessContext.providerIdentifier]
    : [
        item.businessContext.suburb,
        item.businessContext.stateTerritory,
        item.businessContext.postcode ?? '',
      ]
  return normalizeSearchText([
    item.slug,
    item.name,
    item.category,
    ...contextTerms,
    ...item.offerings.flatMap((offering) => [
      offering.name,
      offering.category,
      offering.summary,
      offering.serviceAreaSummary ?? '',
    ]),
  ].join(' ')).includes(token)
}
function matchesSearchLocation(item: PublicBusinessCatalogApiV2Dto, location: string): boolean {
  if (item.businessContext.kind !== 'local_human') return false
  const normalized = normalizeSearchText(location)
  if (normalized.length === 0) return false
  const searchable = normalizeSearchText([
    item.businessContext.suburb,
    item.businessContext.stateTerritory,
    item.businessContext.postcode ?? '',
    ...item.offerings.map((offering) => offering.serviceAreaSummary ?? ''),
  ].join(' '))
  return normalized.split(' ').every((token) => searchable.includes(token))
}

export function getPublicBusinessOfferingSupplyBySlug(
  state: RegistrySourceState,
  input: { slug: Slug | string },
): PublicBusinessCatalogV2DetailResult {
  const business = readPublicCatalogs(state)
    .find((candidate) => candidate.slug === String(input.slug))

  return business === undefined
    ? {
        kind: 'not_found',
        code: 'business_not_found',
        reason: 'No public business catalog exists for this slug.',
      }
    : {
        kind: 'found',
        schemaVersion: PublicBusinessCatalogApiSchemaVersion,
        business,
      }
}

export function resolvePublishedInquiryTarget(
  state: RegistrySourceState,
  input: { businessSlug: Slug | string; offeringRef: OfferingRef | string },
): PublishedInquiryTargetResolution {
  const business = readPublicCatalogs(state)
    .find((candidate) => candidate.slug === String(input.businessSlug))
  const offering = business?.offerings.find((candidate) => candidate.offeringRef === String(input.offeringRef))
  if (business === undefined || offering === undefined) {
    return {
      kind: 'not_found',
      reason: 'No published Offering is discoverable for this slug on the business.',
    }
  }
  return {
    kind: 'resolved',
    businessId: brandNonEmpty(business.businessId, 'BusinessId'),
    offeringRef: brandNonEmpty(offering.offeringRef, 'OfferingRef'),
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
    registrySearchDocuments: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    suppressionRules: [],
  }
  const publishedAt = Date.now()

  const claim = claimBusiness(state, {
    actor: {
      kind: 'authenticated_owner',
      clerkUserId: 'source-owned-owner-session',
      displayName: 'Sam',
    },
    facts: {
      name: publicOwnerDefaultClaimInput.businessName,
      category: publicOwnerDefaultClaimInput.category,
      businessContext: toBusinessContext(publicOwnerDefaultClaimInput),
      requestedSlug: publicOwnerDefaultClaimInput.requestedSlug,
      ownerMessage: publicOwnerDefaultClaimInput.ownerMessage,
      sourceRefs: [
        {
          label: publicOwnerDefaultClaimInput.sourceLabel,
          evidenceRef: `private:evidence:${publicOwnerDefaultClaimInput.requestedSlug}`,
          sourceHash: canonicalDigest(`source:${publicOwnerDefaultClaimInput.requestedSlug}`),
        },
      ],
    },
    security: {
      csrf: matchingCsrf('claim'),
    },
    operationKey: operationKey(`claim:${publicOwnerDefaultClaimInput.requestedSlug}`),
    correlationId: correlationId(`claim:${publicOwnerDefaultClaimInput.requestedSlug}`),
    now: publishedAt - 1,
  })

  if (claim.kind === 'error') {
    throw new Error(`Default registry claim failed: ${claim.reason}`)
  }

  claim.business.publicStatus = 'published'
  claim.business.claimStatus = 'published'
  claim.business.updatedAt = publishedAt
  claim.claim.status = 'published'
  claim.claim.updatedAt = publishedAt

  appendPublishedOffering(state, {
    businessId: claim.business.businessId,
    offeringRef: brandNonEmpty(`offering:${claim.business.businessId}:emergency-pipe-repair`, 'OfferingRef'),
    facts: {
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Burst pipe triage and repair for urgent local plumbing jobs.',
      serviceAreaSummary: 'Parramatta and nearby suburbs',
      availabilitySummary: publicOwnerDefaultClaimInput.hoursOrUnknown,
    },
    now: publishedAt,
  })

  return state
}


function readPublicCatalogs(state: RegistrySourceState): readonly PublicBusinessCatalogApiV2Dto[] {
  const catalogs: PublicBusinessCatalogApiV2Dto[] = []
  for (const business of state.businesses) {
    const result = getPublicBusinessCatalog(state, {
      slug: business.slug,
      indexStatus: indexStatusForBusiness(state, business.businessId),
      discoveryStatus: 'degraded',
    })
    if (result.kind === 'available') {
      catalogs.push(result.catalog)
    }
  }
  return catalogs.sort(compareCatalogs)
}


function appendPublishedOffering(
  state: RegistrySourceState,
  input: {
    businessId: BusinessId
    offeringRef: OfferingRef
    facts: {
      name: string
      category: string
      summary: string
      serviceAreaSummary?: string
      availabilitySummary?: string
      pricingSummary?: string
    }
    accessPaths?: readonly {
      channel: 'phone' | 'website' | 'ae_inquiry'
      disclosure: string
    }[]
    now: number
  },
): void {
  const sourceHash = canonicalDigest({
    businessId: input.businessId,
    offeringRef: input.offeringRef,
    revision: 1,
    ...input.facts,
  })
  state.offerings.push({
    offeringRef: input.offeringRef,
    businessId: input.businessId,
    currentRevision: 1,
    status: 'published',
    createdAt: input.now,
    updatedAt: input.now,
  })
  state.revisions.push({
    offeringRef: input.offeringRef,
    businessId: input.businessId,
    revision: 1,
    ...input.facts,
    sourceHash,
    createdAt: input.now,
  })
  for (const [index, accessPath] of (input.accessPaths ?? []).entries()) {
    const descriptor = {
      kind: 'human_request' as const,
      channel: accessPath.channel,
      disclosure: accessPath.disclosure,
    }
    const accessPathRef = `access:${input.offeringRef}:human:${index + 1}`
    state.accessPaths.push({
      accessPathRef: brandNonEmpty(accessPathRef, 'AccessPathRef'),
      businessId: input.businessId,
      offeringRef: input.offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
      status: 'published',
      descriptor,
      sourceHash: canonicalDigest({
        accessPathRef,
        offeringSourceHash: sourceHash,
        descriptor,
      }),
      createdAt: input.now,
      updatedAt: input.now,
    })
  }
}
function paginateCatalogs(
  items: readonly PublicBusinessCatalogApiV2Dto[],
  input: PublicBusinessCatalogQueryInput,
): PublicBusinessCatalogApiV2Page {
  const requestedStart = input.paginationOpts.cursor === null ? 0 : Number(input.paginationOpts.cursor)
  if (!Number.isSafeInteger(requestedStart) || requestedStart < 0) {
    throw new Error('registry_invalid_cursor')
  }
  const page = items.slice(requestedStart, requestedStart + input.paginationOpts.numItems)
  const nextIndex = requestedStart + page.length
  return {
    kind: 'ok',
    schemaVersion: PublicBusinessCatalogApiSchemaVersion,
    page,
    isDone: nextIndex >= items.length,
    continueCursor: String(nextIndex),
  }
}

function paginateSearchCatalogs(
  items: readonly PublicBusinessCatalogApiV2Dto[],
  input: PublicBusinessCatalogSearchInput,
  query?: string,
): PublicBusinessCatalogApiV2SearchPage {
  const limit = normalizeLimit(input.limit)
  const startIndex = input.cursor === undefined
    ? 0
    : (() => {
        const index = items.findIndex((item) => item.slug === input.cursor)
        if (index < 0) throw new Error('registry_invalid_cursor')
        return index + 1
      })()
  const pageItems = items.slice(startIndex, startIndex + limit)
  const next = items.at(startIndex + pageItems.length)

  return {
    kind: 'ok',
    schemaVersion: PublicBusinessCatalogApiSchemaVersion,
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

function indexStatusForBusiness(
  state: RegistrySourceState,
  businessId: BusinessId,
): IndexStatus {
  const explicit = state.indexStatus.find(
    (status) =>
      status.targetType === 'business' && status.targetRef === businessId,
  )
  if (explicit !== undefined) {
    return explicit.status
  }

  const latestAttempt = state.registryProjectionAttempts
    .filter((attempt) => attempt.businessId === businessId)
    .sort(
      (left, right) =>
        (right.finishedAt ?? right.startedAt) -
        (left.finishedAt ?? left.startedAt),
    )
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

function compareCatalogs(
  left: PublicBusinessCatalogApiV2Dto,
  right: PublicBusinessCatalogApiV2Dto,
): number {
  const byName = left.name.localeCompare(right.name)
  return byName === 0 ? left.slug.localeCompare(right.slug) : byName
}



function operationKey(value: string): OperationKey {
  return brandNonEmpty(`op:registry-default:${value}`, 'OperationKey')
}

function correlationId(value: string): CorrelationId {
  return brandNonEmpty(`corr:registry-default:${value}`, 'CorrelationId')
}
