import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { DefaultFunctionArgs, FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { z } from 'zod'

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
  const claim = await callAuthenticatedMutation(claimBusinessMutation, {
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

  const publish = await callAuthenticatedMutation(publishCatalogMutation, {
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

export async function readOwnerStatusThroughSource(slug: string | undefined): Promise<PublicOwnerStatusRouteReadback> {
  if (usesLocalE2eBypass()) {
    if (slug === undefined || slug.trim().length === 0) {
      return redactOwnerStatusReadback(getDefaultPublicOwnerStatusReadback())
    }

    return redactOwnerStatusReadback(getPublicOwnerStatusReadbackBySlug(slug) ?? getDefaultPublicOwnerStatusReadback())
  }

  const readsCurrentOwner = slug === undefined || slug.trim().length === 0
  let result: PublicCatalogReadResult

  if (readsCurrentOwner) {
    try {
      result = await callAuthenticatedQuery(currentOwnerCatalogQuery, {})
    } catch {
      return redactOwnerStatusReadback(getDefaultPublicOwnerStatusReadback())
    }
  } else {
    result = await callPublicQuery(publicCatalogBySlugQuery, { slug })
  }

  if (result.kind === 'available') {
    return redactOwnerStatusReadback(buildPublicOwnerStatusReadback(result.catalog))
  }

  return redactOwnerStatusReadback(getDefaultPublicOwnerStatusReadback())
}

export async function readPublicBusinessPageThroughSource(slug: string): Promise<PublicBusinessPageRouteReadbackResult> {
  if (usesLocalE2eBypass()) {
    return redactPublicBusinessPageReadback(getLocalE2ePublicBusinessPageReadback(slug))
  }

  const result = await callPublicQuery(publicCatalogBySlugQuery, { slug })
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

function sourceQuery<Args extends DefaultFunctionArgs = DefaultFunctionArgs, Result = unknown>(
  name: string
): FunctionReference<'query', 'public', Args, Result> {
  return makeFunctionReference<'query', Args, Result>(name)
}

function sourceMutation<Args extends DefaultFunctionArgs = DefaultFunctionArgs, Result = unknown>(
  name: string
): FunctionReference<'mutation', 'public', Args, Result> {
  return makeFunctionReference<'mutation', Args, Result>(name)
}

async function callAuthenticatedQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> {
  const client = await createConvexClient({ authenticated: true })
  return client.query(query, args)
}

async function callPublicQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> {
  const client = await createConvexClient({ authenticated: false })
  return client.query(query, args)
}

async function callAuthenticatedMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  const client = await createConvexClient({ authenticated: true })
  return client.mutation(mutation, args)
}

async function createConvexClient(options: { authenticated: boolean }): Promise<ConvexHttpClient> {
  const convexUrl = readRequiredConvexUrl(process.env)
  if (!options.authenticated) {
    return new ConvexHttpClient(convexUrl)
  }

  const authObject = await auth()
  if (!authObject.isAuthenticated) {
    throw new Error('Authenticated owner session is required for this Convex call.')
  }

  const token = await authObject.getToken({ template: 'convex' })
  if (token === null || token.trim().length === 0) {
    throw new Error('Clerk did not return a Convex auth token for this request.')
  }

  return new ConvexHttpClient(convexUrl, { auth: token })
}

function requestOrigin(): string {
  return readEnv(process.env, 'SITE_URL') ?? readEnv(process.env, 'VITE_SITE_URL') ?? 'https://ae.example'
}

function readRequiredConvexUrl(env: Env): string {
  const value = readEnv(env, 'CONVEX_URL') ?? readEnv(env, 'VITE_CONVEX_URL')
  if (value === undefined) {
    throw new Error('CONVEX_URL or VITE_CONVEX_URL is required for server Convex calls.')
  }

  return value
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
