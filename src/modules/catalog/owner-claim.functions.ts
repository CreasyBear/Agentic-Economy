import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { LOCAL_E2E_BUSINESS_FIXTURES } from '@/lib/dev/local-e2e-business-fixtures'

import {
  callPublicSourceQuery,
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import {
  buildPublicOwnerStatusReadback,
  getDefaultPublicOwnerStatusReadback,
  getPublicBusinessPageReadback,
  getPublicOwnerStatusReadbackBySlug,
  submitDurablePublicOwnerClaimFlow,
  submitPublicOwnerClaimFlow,
  toServiceCatalogInput,
} from '@/modules/catalog/public'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import { readCurrentOwnerTargetAdmissionThroughSource } from '@/modules/inquiries/inquiry.functions'
import { selectOwnerAdmissionTarget } from '@/modules/inquiries/route-readbacks'
import { unconfiguredR1TargetAdmission } from '@/modules/inquiries/public'
import { SourceWriteAdmissionError, type SourceWriteAdmission } from '@/modules/security/source-write-admission'
import type {
  PublicBusinessPageNotFoundReason,
  PublicBusinessPageRouteReadbackResult,
  PublicBusinessPageReadbackResult,
  PublicOwnerClaimFlowRouteResult,
  PublicOwnerClaimFlowInput,
  PublicOwnerStatusRouteReadbackResult,
  PublicOwnerStatusRouteReadback,
  PublicOwnerStatusReadback,
  ServiceCatalogInput,
} from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const ownerClaimInputSchema = z.object({
  businessName: z.string(),
  category: z.string(),
  suburb: z.string(),
  stateTerritory: z.string(),
  requestedSlug: z.string(),
  publishedPhone: z.string().optional().default(''),
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
  | { kind: 'available'; catalog: PublicBusinessCatalogApiV2Dto }
  | { kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }
  | { kind: 'unavailable'; reason: 'source_unavailable'; retryable: true }

const publicPageInputSchema = z.object({
  slug: z.string(),
})

type ClaimBusinessArgs = {
  name: string
  category: string
  suburb: string
  stateTerritory: string
  requestedSlug: string
  publishedPhone?: string
  ownerMessage?: string
  sourceRefs: readonly { label: string; evidenceRef: string }[]
  origin?: string
  sourceWrite?: SourceWriteAdmission
  operationKey: string
  correlationId: string
}

type ClaimBusinessResult =
  | {
      kind: 'ok'
      code: 'claim_created' | 'claim_replayed'
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
  sourceWrite?: SourceWriteAdmission
  operationKey: string
  correlationId: string
}

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
  if (isLocalE2EAuthBypassEnabled()) {
    const result = submitDurablePublicOwnerClaimFlow(input)
    return result.kind === 'error'
      ? result
      : {
          ...result,
          readback: await buildOwnerStatusRouteReadback(result.readback),
        }
  }

  try {
    const origin = resolveCanonicalBaseUrl().baseUrl
    const operationSuffix = `${normalizeOperationPart(input.requestedSlug)}:${crypto.randomUUID()}`
    const claimOperationKey = `claim:${operationSuffix}`
    const claimCorrelationId = `claim:${operationSuffix}`
    const publishOperationKey = `publish:${operationSuffix}`
    const publishCorrelationId = `publish:${operationSuffix}`
    const claim = await callSourceMutation(claimBusinessMutation, {
      name: input.businessName,
      category: input.category,
      suburb: input.suburb,
      stateTerritory: input.stateTerritory,
      requestedSlug: input.requestedSlug,
      ...(input.publishedPhone.trim().length === 0 ? {} : { publishedPhone: input.publishedPhone }),
      ...(input.ownerMessage.trim().length === 0 ? {} : { ownerMessage: input.ownerMessage }),
      sourceRefs: [{ label: input.sourceLabel, evidenceRef: `owner-submitted:${normalizeOperationPart(input.requestedSlug)}` }],
      origin,
      sourceWrite: await sourceWriteAdmissionFromContext({
        context,
        scope: 'owner_claim',
        operationKey: claimOperationKey,
        correlationId: claimCorrelationId,
      }),
      operationKey: claimOperationKey,
      correlationId: claimCorrelationId,
    })

    if (claim.kind === 'error') {
      return {
        kind: 'error',
        code: 'claim_flow_claim_rejected',
        retryable: claim.retryable,
        reason: claim.reason,
      }
    }

    const publish = await callSourceMutation(publishCatalogMutation, {
      claimId: claim.claim.claimId,
      services: [toServiceCatalogInput(input, { omitBlankDisclosure: true })],
      origin,
      sourceWrite: await sourceWriteAdmissionFromContext({
        context,
        scope: 'catalog_publish',
        operationKey: publishOperationKey,
        correlationId: publishCorrelationId,
      }),
      operationKey: publishOperationKey,
      correlationId: publishCorrelationId,
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
  return result.kind === 'available' ? { kind: 'available', catalog: result.readback.catalog } : result
}

export async function readOwnerStatusThroughSource(slug: string | undefined): Promise<PublicOwnerStatusRouteReadbackResult> {
  const readsCurrentOwner = slug === undefined || slug.trim().length === 0
  const localE2E = isLocalE2EAuthBypassEnabled()
  if (localE2E && !readsCurrentOwner) return readLocalOwnerStatus(slug)

  try {
    const result = readsCurrentOwner
      ? await callSourceQuery(currentOwnerCatalogQuery, {})
      : await callPublicSourceQuery(publicCatalogBySlugQuery, { slug })

    if (result.kind === 'available') {
      return { kind: 'available', readback: await buildOwnerStatusRouteReadback(buildPublicOwnerStatusReadback(result.catalog)) }
    }
    return localE2E
      ? readLocalOwnerStatus(slug)
      : { kind: 'not_found', reason: result.reason }
  } catch {
    return localE2E
      ? readLocalOwnerStatus(slug)
      : { kind: 'unavailable', reason: 'source_unavailable', retryable: true }
  }
}

async function readLocalOwnerStatus(slug: string | undefined): Promise<PublicOwnerStatusRouteReadbackResult> {
  const defaultReadback = getDefaultPublicOwnerStatusReadback()
  const normalizedSlug = slug?.trim()
  if (normalizedSlug === undefined || normalizedSlug.length === 0 || normalizedSlug === defaultReadback.catalog.slug) {
    return { kind: 'available', readback: await buildOwnerStatusRouteReadback(defaultReadback) }
  }

  const readback = getPublicOwnerStatusReadbackBySlug(normalizedSlug)
  return readback === undefined
    ? { kind: 'not_found', reason: 'not_public' }
    : { kind: 'available', readback: await buildOwnerStatusRouteReadback(readback) }
}

async function readPublicBusinessPageThroughSource(slug: string): Promise<PublicBusinessPageRouteReadbackResult> {
  if (isLocalE2EAuthBypassEnabled()) {
    return getLocalE2ePublicBusinessPageReadback(slug)
  }

  const result = await callPublicSourceQuery(publicCatalogBySlugQuery, { slug })
  return result.kind === 'available'
    ? { kind: 'available', catalog: result.catalog }
    : { kind: 'not_found', reason: result.reason }
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



function getLocalE2ePublicBusinessPageReadback(slug: string): PublicBusinessPageReadbackResult {
  const fixture = LOCAL_E2E_BUSINESS_FIXTURES.find((candidate) => candidate.requestedSlug === slug)
  if (fixture === undefined) {
    return getPublicBusinessPageReadback(slug)
  }
  const offering = fixture.offerings[0]
  if (offering === undefined) {
    throw new Error(`Local e2e fixture has no offering: ${fixture.requestedSlug}`)
  }

  const result = submitPublicOwnerClaimFlow({
    businessName: fixture.businessName,
    category: fixture.category,
    suburb: fixture.suburb,
    stateTerritory: fixture.stateTerritory,
    requestedSlug: fixture.requestedSlug,
    publishedPhone: fixture.publishedPhone ?? '',
    ownerMessage: 'Local e2e owner-supplied service facts.',
    sourceLabel: 'Local e2e service facts',
    serviceName: offering.name,
    serviceCategory: offering.category,
    serviceSummary: offering.summary,
    serviceArea: offering.serviceAreaSummary,
    hoursOrUnknown: offering.availabilitySummary,
    photoUrl: '',
    responseTimeMinutes: fixture.responseTimeMinutes?.toString() ?? '',
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Use the inquiry form for a first contact.',
    noContactReason: '',
  })
  return result.kind === 'ok'
    ? { kind: 'available', catalog: result.catalog }
    : { kind: 'not_found', reason: 'not_public' }
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
