import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  callPublicSourceQuery,
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import {
  buildPublicOwnerStatusReadback,
  getDefaultPublicOwnerStatusReadback,
  getPublicBusinessPageReadback,
  getPublicOwnerStatusReadbackBySlug,
  submitDurablePublicOwnerClaimFlow,
  submitPublicOwnerClaimFlow,
} from '@/modules/catalog/public'
import type {
  PublicBusinessPageRouteReadbackResult,
  PublicBusinessPageReadbackResult,
  PublicCatalogContract,
  PublicOwnerClaimFlowRouteResult,
  PublicOwnerClaimFlowInput,
  PublicOwnerClaimFlowResult,
  PublicOwnerStatusRouteReadbackResult,
  PublicOwnerStatusRouteReadback,
  PublicOwnerStatusReadback,
  PublicRouteCatalogContract,
} from '@/modules/catalog/public'

const ownerClaimInputSchema = z.object({
  businessName: z.string(),
  category: z.string(),
  suburb: z.string(),
  stateTerritory: z.string(),
  requestedSlug: z.string(),
  ownerMessage: z.string(),
  sourceLabel: z.string(),
  serviceName: z.string(),
  serviceCategory: z.string(),
  serviceSummary: z.string(),
  serviceArea: z.string(),
  hoursOrUnknown: z.string(),
  firstRequestMode: z.enum(['inquiry_available', 'quote_request_available', 'not_available_yet']),
  publicDisclosure: z.string(),
  noContactReason: z.string(),
})

const ownerStatusInputSchema = z.object({
  slug: z.string().optional(),
})

const publicPageInputSchema = z.object({
  slug: z.string(),
})

type ClaimBusinessArgs = {
  name: string
  category: string
  suburb: string
  stateTerritory: string
  requestedSlug: string
  ownerMessage?: string
  sourceRefs: readonly { label: string; evidenceRef: string }[]
  origin?: string
  operationKey: string
  correlationId: string
}

type ClaimBusinessResult =
  | {
      kind: 'ok'
      code: 'claim_created'
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
  services: readonly {
    name: string
    category: string
    summary: string
    serviceArea: string
    hoursOrUnknown: string
    firstRequest:
      | {
          mode: 'inquiry_available' | 'quote_request_available'
          publicDisclosure: string
          publicChannel: 'public_business_contact' | 'ae_status_only'
        }
      | {
          mode: 'not_available_yet'
          publicDisclosure?: string
          publicChannel: 'not_available'
          noContactReason: string
        }
  }[]
  origin?: string
  operationKey: string
  correlationId: string
}

type PublishCatalogResult =
  | {
      kind: 'ok'
      code: 'catalog_published' | 'catalog_publish_replayed'
      catalog: PublicCatalogContract
    }
  | {
      kind: 'error'
      code: string
      retryable: boolean
      reason: string
    }

type PublicCatalogReadResult =
  | { kind: 'available'; catalog: PublicCatalogContract }
  | { kind: 'not_found'; reason: 'not_public' }

type Env = Record<string, string | undefined>

export type OwnerCatalogSourcePort = {
  claim: (args: ClaimBusinessArgs) => Promise<ClaimBusinessResult>
  publish: (args: PublishCatalogArgs) => Promise<PublishCatalogResult>
  readCurrentOwnerCatalog: () => Promise<PublicCatalogReadResult>
  readPublicCatalogBySlug: (args: { slug: string }) => Promise<PublicCatalogReadResult>
}

const claimBusinessMutation = sourceMutation<ClaimBusinessArgs, ClaimBusinessResult>('business:claimBusiness')
const publishCatalogMutation = sourceMutation<PublishCatalogArgs, PublishCatalogResult>('catalog:publishBusinessCatalog')
const publicCatalogBySlugQuery = sourceQuery<{ slug: string }, PublicCatalogReadResult>('catalog:getPublicBusinessCatalogBySlug')
const currentOwnerCatalogQuery = sourceQuery<Record<string, never>, PublicCatalogReadResult>('catalog:getCurrentOwnerPublicCatalog')

export const submitOwnerClaimServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerClaimInputSchema.parse(data))
  .handler(async ({ data }) => submitOwnerClaimThroughSource(data))

export const readOwnerStatusServer = createServerFn()
  .validator((data) => ownerStatusInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => readOwnerStatusThroughSource(data.slug))

export const readPublicBusinessPageServer = createServerFn()
  .validator((data) => publicPageInputSchema.parse(data))
  .handler(async ({ data }) => readPublicBusinessPageThroughSource(data.slug))

export async function submitOwnerClaimThroughSource(input: PublicOwnerClaimFlowInput): Promise<PublicOwnerClaimFlowRouteResult> {
  if (usesLocalE2eBypass()) {
    return redactOwnerClaimResult(submitDurablePublicOwnerClaimFlow(input))
  }

  const origin = requestOrigin()
  const operationSuffix = `${normalizeOperationPart(input.requestedSlug)}:${crypto.randomUUID()}`
  const source = ownerCatalogSourcePort()
  const claim = await source.claim({
    name: input.businessName,
    category: input.category,
    suburb: input.suburb,
    stateTerritory: input.stateTerritory,
    requestedSlug: input.requestedSlug,
    ...(input.ownerMessage.trim().length === 0 ? {} : { ownerMessage: input.ownerMessage }),
    sourceRefs: [{ label: input.sourceLabel, evidenceRef: `owner-submitted:${normalizeOperationPart(input.requestedSlug)}` }],
    origin,
    operationKey: `claim:${operationSuffix}`,
    correlationId: `claim:${operationSuffix}`,
  })

  if (claim.kind === 'error') {
    return {
      kind: 'error',
      code: 'claim_flow_claim_rejected',
      retryable: claim.retryable,
      reason: claim.reason,
    }
  }

  const publish = await source.publish({
    claimId: claim.claim.claimId,
    services: [toServiceCatalogArgs(input)],
    origin,
    operationKey: `publish:${operationSuffix}`,
    correlationId: `publish:${operationSuffix}`,
  })

  if (publish.kind === 'error') {
    return {
      kind: 'error',
      code: 'claim_flow_publish_rejected',
      retryable: publish.retryable,
      reason: publish.reason,
    }
  }

  const publicCatalog = redactCatalogSourceHashes(publish.catalog)

  return {
    kind: 'ok',
    code: 'claim_flow_published',
    catalog: publicCatalog,
    readback: {
      ...redactOwnerStatusReadback(buildPublicOwnerStatusReadback(publish.catalog)),
      catalog: publicCatalog,
    },
  }
}

export async function readOwnerStatusThroughSource(slug: string | undefined): Promise<PublicOwnerStatusRouteReadbackResult> {
  if (usesLocalE2eBypass()) {
    return readLocalOwnerStatus(slug)
  }

  const readsCurrentOwner = slug === undefined || slug.trim().length === 0

  try {
    const result = readsCurrentOwner
      ? await ownerCatalogSourcePort().readCurrentOwnerCatalog()
      : await ownerCatalogSourcePort().readPublicCatalogBySlug({ slug })

    return result.kind === 'available'
      ? { kind: 'available', readback: redactOwnerStatusReadback(buildPublicOwnerStatusReadback(result.catalog)) }
      : { kind: 'not_found', reason: result.reason }
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable', retryable: true }
  }
}

function readLocalOwnerStatus(slug: string | undefined): PublicOwnerStatusRouteReadbackResult {
  const defaultReadback = getDefaultPublicOwnerStatusReadback()
  const normalizedSlug = slug?.trim()
  if (normalizedSlug === undefined || normalizedSlug.length === 0 || normalizedSlug === defaultReadback.catalog.slug) {
    return { kind: 'available', readback: redactOwnerStatusReadback(defaultReadback) }
  }

  const readback = getPublicOwnerStatusReadbackBySlug(normalizedSlug)
  return readback === undefined
    ? { kind: 'not_found', reason: 'not_public' }
    : { kind: 'available', readback: redactOwnerStatusReadback(readback) }
}

export async function readPublicBusinessPageThroughSource(slug: string): Promise<PublicBusinessPageRouteReadbackResult> {
  if (usesLocalE2eBypass()) {
    return redactPublicBusinessPageReadback(getLocalE2ePublicBusinessPageReadback(slug))
  }

  const result = await ownerCatalogSourcePort().readPublicCatalogBySlug({ slug })
  return result.kind === 'available'
    ? { kind: 'available', catalog: redactCatalogSourceHashes(result.catalog) }
    : { kind: 'not_found', reason: 'not_public' }
}

function redactOwnerClaimResult(result: PublicOwnerClaimFlowResult): PublicOwnerClaimFlowRouteResult {
  if (result.kind === 'error') {
    return result
  }

  const catalog = redactCatalogSourceHashes(result.catalog)
  return {
    ...result,
    catalog,
    readback: {
      ...redactOwnerStatusReadback(result.readback),
      catalog,
    },
  }
}

function redactOwnerStatusReadback(readback: PublicOwnerStatusReadback): PublicOwnerStatusRouteReadback {
  return {
    ...readback,
    catalog: redactCatalogSourceHashes(readback.catalog),
  }
}

function redactPublicBusinessPageReadback(readback: PublicBusinessPageReadbackResult): PublicBusinessPageRouteReadbackResult {
  return readback.kind === 'available' ? { ...readback, catalog: redactCatalogSourceHashes(readback.catalog) } : readback
}

function getLocalE2ePublicBusinessPageReadback(slug: string): PublicBusinessPageReadbackResult {
  if (slug !== 'plumbing-demo') {
    return getPublicBusinessPageReadback(slug)
  }

  const result = submitPublicOwnerClaimFlow({
    businessName: 'Demo Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    requestedSlug: 'plumbing-demo',
    ownerMessage: 'Local e2e inquiry-capable service facts.',
    sourceLabel: 'Local e2e service facts',
    serviceName: 'Emergency plumbing',
    serviceCategory: 'Emergency plumbing',
    serviceSummary: 'Human triage for urgent plumbing issues.',
    serviceArea: 'Parramatta',
    hoursOrUnknown: 'Hours supplied by owner',
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Use the source-owned inquiry form for a first contact.',
    noContactReason: '',
  })

  return result.kind === 'ok' ? { kind: 'available', catalog: result.catalog } : { kind: 'not_found', reason: 'not_public' }
}

function redactCatalogSourceHashes(catalog: PublicCatalogContract): PublicRouteCatalogContract {
  const { sourceHash: _catalogSourceHash, services, ...catalogRest } = catalog
  return {
    ...catalogRest,
    services: services.map((service) => {
      const { sourceHash: _serviceSourceHash, capabilities, ...serviceRest } = service
      return {
        ...serviceRest,
        capabilities: capabilities.map((capability) => {
          const { sourceHash: _capabilitySourceHash, ...capabilityRest } = capability
          return capabilityRest
        }),
      }
    }),
  }
}

function toServiceCatalogArgs(input: PublicOwnerClaimFlowInput): PublishCatalogArgs['services'][number] {
  return {
    name: input.serviceName,
    category: input.serviceCategory,
    summary: input.serviceSummary,
    serviceArea: input.serviceArea,
    hoursOrUnknown: input.hoursOrUnknown,
    firstRequest:
      input.firstRequestMode === 'not_available_yet'
        ? {
            mode: 'not_available_yet',
            ...(input.publicDisclosure.trim().length === 0 ? {} : { publicDisclosure: input.publicDisclosure }),
            publicChannel: 'not_available',
            noContactReason: input.noContactReason,
          }
        : {
            mode: input.firstRequestMode,
            publicDisclosure: input.publicDisclosure,
            publicChannel: input.firstRequestMode === 'quote_request_available' ? 'ae_status_only' : 'public_business_contact',
          },
  }
}

function ownerCatalogSourcePort(): OwnerCatalogSourcePort {
  return {
    claim: (args) => callSourceMutation(claimBusinessMutation, args),
    publish: (args) => callSourceMutation(publishCatalogMutation, args),
    readCurrentOwnerCatalog: () => callSourceQuery(currentOwnerCatalogQuery, {}),
    readPublicCatalogBySlug: (args) => callPublicSourceQuery(publicCatalogBySlugQuery, args),
  }
}

function requestOrigin(): string {
  return readEnv(process.env, 'SITE_URL') ?? readEnv(process.env, 'VITE_SITE_URL') ?? 'https://ae.example'
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}

function normalizeOperationPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72)
  return normalized.length === 0 ? 'claim' : normalized
}
