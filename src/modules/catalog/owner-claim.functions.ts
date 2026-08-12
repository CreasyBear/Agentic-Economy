import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callPublicSourceQuery,
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import {
  sourceWriteAdmissionFromContext,
} from '@/lib/server/source-write-admission'
import {
  buildPublicOwnerStatusReadback,
  toBusinessContext,
  toServiceCatalogInput,
  validatePublicOwnerClaimFlowInput,
} from '@/modules/catalog/public'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import type { BusinessId, Slug } from '@/modules/common/ids'
import { readCurrentOwnerTargetAdmissionThroughSource } from '@/modules/inquiries/inquiry.functions'
import { selectOwnerAdmissionTarget } from '@/modules/inquiries/route-readbacks'
import { unconfiguredR1TargetAdmission } from '@/modules/inquiries/public'
import { readPublicOfferingRegistryBusinessDetail } from '@/modules/registry/registry.functions'
import {
  SourceWriteAdmissionError,
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import type {
  BusinessContext,
} from '@/modules/business/public'
import type {
  PublicBusinessPageNotFoundReason,
  PublicBusinessPageRouteReadbackResult,
  PublicOwnerClaimFlowRouteResult,
  PublicOwnerClaimFlowInput,
  PublicOwnerStatusRouteReadback,
  PublicOwnerStatusRouteReadbackResult,
  PublicOwnerStatusReadback,
  ServiceCatalogInput,
} from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const ownerClaimInputSchema = z.object({
  businessContext: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('local_human'),
      suburb: z.string(),
      stateTerritory: z.string(),
      postcode: z.string().exactOptional(),
      publishedPhone: z.string().exactOptional(),
    }),
    z.object({
      kind: z.literal('programmable_provider'),
      website: z.string(),
      providerIdentifier: z.string(),
    }),
  ]),
  businessName: z.string(),
  category: z.string(),
  requestedSlug: z.string(),
  ownerMessage: z.string(),
  sourceLabel: z.string(),
  serviceName: z.string(),
  serviceCategory: z.string(),
  serviceSummary: z.string(),
  serviceArea: z.string(),
  hoursOrUnknown: z.string(),
  photoUrl: z.string(),
  responseTimeMinutes: z.string(),
  firstRequestMode: z.enum(['inquiry_available', 'quote_request_available', 'not_available_yet']),
  publicDisclosure: z.string(),
  noContactReason: z.string(),
  source: z.literal('supply').optional(),
})
const ownerStatusInputSchema = z.object({
  slug: z.string().optional(),
  source: z.literal('supply').optional(),
})

type ClaimSuccessPageResult =
  | {
      kind: 'available'
      catalog: PublicBusinessCatalogApiV2Dto
      projectionMode: 'public_source'
    }
  | { kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }
  | { kind: 'unavailable'; reason: 'source_unavailable'; retryable: true }

const publicPageInputSchema = z.object({
  slug: z.string(),
})

type ClaimBusinessArgs = {
  name: string
  category: string
  businessContext: BusinessContext
  requestedSlug: string
  ownerMessage?: string
  sourceRefs: readonly { label: string; evidenceRef: string }[]
  origin?: string
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
  operationKey: string
  correlationId: string
}

type ClaimBusinessCommand = Omit<ClaimBusinessArgs, 'sourceWrite' | 'sourceWriteRequest'>

type ClaimBusinessResult =
  | {
      kind: 'ok'
      code: 'claim_created' | 'claim_replayed'
      business: { businessId: BusinessId; slug: Slug; businessContext: BusinessContext }
      claim: { claimId: string }
    }
  | {
      kind: 'error'
      code: string
      retryable: boolean
      reason: string
    }

type PublishCatalogArgs = {
  claimId: string
  services: readonly ServiceCatalogInput[]
  origin?: string
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
  operationKey: string
  correlationId: string
}

type PublishCatalogCommand = Omit<PublishCatalogArgs, 'sourceWrite' | 'sourceWriteRequest'>

type PublishCatalogResult =
  | {
      kind: 'ok'
      code: 'catalog_published' | 'catalog_publish_replayed'
      catalog: PublicBusinessCatalogApiV2Dto
    }
  | {
      kind: 'error'
      code: string
      retryable: boolean
      reason: string
    }

type PublicCatalogReadResult =
  | { kind: 'available'; catalog: PublicBusinessCatalogApiV2Dto }
  | { kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }


const claimBusinessMutation = sourceMutation<ClaimBusinessArgs, ClaimBusinessResult>('business:claimBusiness')
const publishCatalogMutation = sourceMutation<PublishCatalogArgs, PublishCatalogResult>('catalog:publishBusinessCatalog')

const publicCatalogBySlugQuery = sourceQuery<{ slug: string }, PublicCatalogReadResult>('catalog:getPublicBusinessCatalogBySlug')
const currentOwnerCatalogQuery = sourceQuery<Record<string, never>, PublicCatalogReadResult>('catalog:getCurrentOwnerPublicCatalog')

export const submitOwnerClaimServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerClaimInputSchema.parse(data))
  .handler(async ({ data, context }) => submitOwnerClaimThroughSource(data, context))

export const readOwnerStatusServer = createServerFn()
  .validator((data) => ownerStatusInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => readOwnerStatusThroughSource(data.slug))

export const readOwnerClaimSuccessServer = createServerFn()
  .validator((data) => ownerStatusInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => readOwnerClaimSuccessThroughSource(data.slug))

export const readPublicBusinessPageServer = createServerFn()
  .validator((data) => publicPageInputSchema.parse(data))
  .handler(async ({ data }) => readPublicBusinessPageThroughSource(data.slug))

async function submitOwnerClaimThroughSource(
  input: PublicOwnerClaimFlowInput,
  context?: unknown
): Promise<PublicOwnerClaimFlowRouteResult> {
  const validation = validatePublicOwnerClaimFlowInput(input)
  if (validation.kind === 'invalid') {
    return {
      kind: 'error',
      code: 'claim_flow_invalid',
      retryable: false,
      reason: 'Some service page facts need attention.',
      errors: validation.errors,
    }
  }

  const normalized = validation.input
  try {
    const origin = resolveCanonicalBaseUrl().baseUrl
    const operationSuffix = `${normalizeOperationPart(normalized.requestedSlug)}:${crypto.randomUUID()}`
    const claimOperationKey = `claim:${operationSuffix}`
    const claimCorrelationId = `claim:${operationSuffix}`
    const publishOperationKey = `publish:${operationSuffix}`
    const publishCorrelationId = `publish:${operationSuffix}`
    const claimCommand: ClaimBusinessCommand = {
      name: normalized.businessName,
      category: normalized.category,
      businessContext: toBusinessContext(normalized),
      requestedSlug: normalized.requestedSlug,
      ...(normalized.ownerMessage.trim().length === 0 ? {} : { ownerMessage: normalized.ownerMessage }),
      sourceRefs: [{ label: normalized.sourceLabel, evidenceRef: `owner-submitted:${normalizeOperationPart(normalized.requestedSlug)}` }],
      origin,
      operationKey: claimOperationKey,
      correlationId: claimCorrelationId,
    }
    const claimSourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command: claimCommand,
      scope: 'owner_claim',
      operationKey: claimOperationKey,
      correlationId: claimCorrelationId,
    })
    const claim = await callSourceMutation(claimBusinessMutation, {
      ...claimCommand,
      sourceWriteRequest: sourceWriteRequestFromAdmission(claimSourceWrite),
      sourceWrite: claimSourceWrite,
    })

    if (claim.kind === 'error') {
      return {
        kind: 'error',
        code: 'claim_flow_claim_rejected',
        retryable: claim.retryable,
        reason: claim.reason,
      }
    }

    if (normalized.businessContext.kind === 'programmable_provider') {
      return {
        kind: 'provider_claimed',
        code: 'claim_flow_provider_claimed',
        business: claim.business,
        claimId: claim.claim.claimId,
      }
    }

    const publishCommand: PublishCatalogCommand = {
      claimId: claim.claim.claimId,
      services: [toServiceCatalogInput(normalized, { omitBlankDisclosure: true })],
      origin,
      operationKey: publishOperationKey,
      correlationId: publishCorrelationId,
    }
    const publishSourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command: publishCommand,
      scope: 'catalog_publish',
      operationKey: publishOperationKey,
      correlationId: publishCorrelationId,
    })
    const publish = await callSourceMutation(publishCatalogMutation, {
      ...publishCommand,
      sourceWriteRequest: sourceWriteRequestFromAdmission(publishSourceWrite),
      sourceWrite: publishSourceWrite,
    })

    if (publish.kind === 'error') {
      return {
        kind: 'error',
        code: 'claim_flow_publish_rejected',
        retryable: publish.retryable,
        reason: publish.reason,
      }
    }

    return {
      kind: 'ok',
      code: 'claim_flow_published',
      catalog: publish.catalog,
      readback: await buildOwnerStatusRouteReadback(buildPublicOwnerStatusReadback(publish.catalog)),
    }
  } catch (error) {
    return ownerClaimSourceWriteError(error)
  }
}

async function readOwnerClaimSuccessThroughSource(slug: string | undefined): Promise<ClaimSuccessPageResult> {
  const result = await readOwnerStatusThroughSource(slug)
  if (result.kind !== 'available') return result

  try {
    const publicPage = await readPublicBusinessPageThroughSource(result.readback.catalog.slug)
    if (publicPage.kind !== 'available') return publicPage
    const detail = await readPublicOfferingRegistryBusinessDetail({ slug: publicPage.catalog.slug })
    return detail.kind === 'found'
      ? { kind: 'available', catalog: detail.business, projectionMode: 'public_source' }
      : { kind: 'not_found', reason: 'not_public' }
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable', retryable: true }
  }
}

export async function readOwnerStatusThroughSource(slug: string | undefined): Promise<PublicOwnerStatusRouteReadbackResult> {
  const readsCurrentOwner = slug === undefined || slug.trim().length === 0
  try {
    const result = readsCurrentOwner
      ? await callSourceQuery(currentOwnerCatalogQuery, {})
      : await callPublicSourceQuery(publicCatalogBySlugQuery, { slug })

    if (result.kind === 'available') {
      const publicDetail = await readPublicOfferingRegistryBusinessDetail({ slug: result.catalog.slug })
      if (publicDetail.kind === 'not_found') return { kind: 'not_found', reason: 'not_public' }
      return { kind: 'available', readback: await buildOwnerStatusRouteReadback(buildPublicOwnerStatusReadback(result.catalog)) }
    }
    return { kind: 'not_found', reason: result.reason }
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable', retryable: true }
  }
}


async function readPublicBusinessPageThroughSource(slug: string): Promise<PublicBusinessPageRouteReadbackResult> {
  try {

    const result = await callPublicSourceQuery(publicCatalogBySlugQuery, { slug })
    return result.kind === 'available'
      ? { kind: 'available', catalog: result.catalog }
      : { kind: 'not_found', reason: result.reason }
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable', retryable: true }
  }
}


async function buildOwnerStatusRouteReadback(readback: PublicOwnerStatusReadback): Promise<PublicOwnerStatusRouteReadback> {
  const target = selectOwnerAdmissionTarget(readback.catalog)
  if (target === undefined) {
    return {
      ...readback,
      admission: unconfiguredR1TargetAdmission(),
    }
  }
  const result = await readCurrentOwnerTargetAdmissionThroughSource(target)
  if (result.kind === 'error') {
    throw new Error(result.reason)
  }

  return {
    ...readback,
    admission: result.admission,
  }
}








function ownerClaimSourceWriteError(error: unknown): PublicOwnerClaimFlowRouteResult {
  if (error instanceof SourceWriteAdmissionError) {
    return {
      kind: 'error',
      code: 'claim_flow_claim_rejected',
      retryable: false,
      reason: error.code,
    }
  }

  return {
    kind: 'error',
    code: 'claim_flow_claim_rejected',
    retryable: true,
    reason: 'source_write_unavailable',
  }
}

function normalizeOperationPart(value: string): string {
  return normalizeSlug(value) || 'claim'
}
