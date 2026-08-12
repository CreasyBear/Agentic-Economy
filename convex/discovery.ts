import { mutationGeneric, paginationOptsValidator, queryGeneric, type PaginationOptions } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { internalMutation, type DatabaseReader, type DatabaseWriter, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import {
  buildCatalogDiscoveryManifest,
  buildOfferingLlmsTxt,
} from '../src/modules/discovery/convex'
import type {
  DiscoveryManifestContract,
  DiscoveryManifestReadback,
} from '../src/modules/discovery/public'
import {
  projectBusinessSupplyToPublicApi,
  type PublicBusinessCatalogApiV2Dto,
} from '../src/modules/registry/public'
import { internal } from './_generated/api'
import { resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import { isRecord } from '../src/modules/common/is-record'
import { normalizeSlug } from '../src/modules/common/normalize-slug'
import { trimTrailingSlashes } from '../src/modules/common/trim-trailing-slashes'
import { hasActiveBusinessSuppression } from './catalogRuntimeQueries'
import { readBusinessSupplyProjectionSnapshot } from './businessSupplyProjectionSnapshot'
import { compareExactAmounts, exactAmountSchema } from '../src/modules/money/public'
import type { BusinessMutationActor } from '../src/modules/business/public'
import { businessContext as businessContextResult } from '../src/modules/business/public'


const routeResult = v.object({
  kind: v.union(v.literal('business_page'), v.literal('ucp_manifest'), v.literal('api_detail')),
  url: v.string(),
  routeTested: v.literal(true),
})

const exactAmountResult = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})

const manifestPriceResult = v.union(
  v.object({
    kind: v.literal('quote_only'),
    currency: v.string(),
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
  v.object({
    kind: v.union(v.literal('fixed'), v.literal('from')),
    amount: exactAmountResult,
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
  v.object({
    kind: v.literal('range'),
    minimum: exactAmountResult,
    maximum: exactAmountResult,
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
)

const manifestAccessPathResult = v.union(
  v.object({
    accessPathRef: v.string(),
    offeringRevision: v.number(),
    kind: v.literal('human_request'),
    channel: v.union(v.literal('phone'), v.literal('website'), v.literal('ae_inquiry')),
    disclosure: v.string(),
    url: v.optional(v.string()),
  }),
  v.object({
    accessPathRef: v.string(),
    offeringRevision: v.number(),
    kind: v.literal('external_operation'),
    name: v.string(),
    summary: v.string(),
    url: v.string(),
    method: v.optional(v.string()),
    documentationUrl: v.optional(v.string()),
    interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })),
    authenticationSummary: v.optional(v.string()),
    pricingSummary: v.optional(v.string()),
    provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')),
  }),
)

const manifestOfferingResult = v.object({
  offeringRef: v.string(),
  revision: v.number(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceAreaSummary: v.optional(v.string()),
  availabilitySummary: v.optional(v.string()),
  pricingSummary: v.optional(v.string()),
  price: v.optional(manifestPriceResult),
  accessPaths: v.array(manifestAccessPathResult),
  support: v.object({
    integrated: v.boolean(),
    aeSupportedAction: v.boolean(),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
  }),
})

const currentManifestResult = v.object({
  schemaVersion: v.literal('ae-ucp-fallback:v1'),
  businessCatalogSchemaVersion: v.literal('public-business-catalog-api:v2'),
  businessId: v.string(),
  slug: v.string(),
  businessName: v.string(),
  category: v.string(),
  businessContext: businessContextResult,
  publicUrl: v.string(),
  manifestUrl: v.string(),
  ucpVersion: v.string(),
  pathKind: v.literal('ae_hosted_fallback'),
  disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
  sourceHash: v.optional(v.string()),
  sourceVersion: v.literal('public-catalog:v1'),
  generatedHash: v.string(),
  bodyHash: v.string(),
  urlHash: v.string(),
  generatedAt: v.number(),
  observedAt: v.number(),
  routes: v.array(routeResult),
  offerings: v.array(manifestOfferingResult),
  degradedReason: v.optional(v.string()),
  suppressedAt: v.optional(v.number()),
})


const legacyManifestCapabilityResult = v.object({
  kind: v.union(
    v.literal('phone_inquiry'),
    v.literal('quote_request'),
    v.literal('emergency_callout_interest'),
    v.literal('ae_hosted_discovery'),
  ),
  status: v.union(v.literal('available'), v.literal('degraded'), v.literal('unavailable'), v.literal('stale')),
  firstRequest: v.object({
    mode: v.union(v.literal('inquiry_available'), v.literal('quote_request_available'), v.literal('not_available_yet')),
    publicDisclosure: v.string(),
    publicChannel: v.union(v.literal('public_business_contact'), v.literal('ae_status_only'), v.literal('not_available')),
    noContactReason: v.optional(v.string()),
  }),
  callable: v.literal(false),
  paymentRequired: v.literal(false),
  reason: v.optional(v.string()),
})

const legacyManifestServiceResult = v.object({
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceArea: v.string(),
  hoursOrUnknown: v.string(),
  status: v.literal('published'),
  capabilities: v.array(legacyManifestCapabilityResult),
})

const legacyUnavailableManifestResult = v.object({
  kind: v.literal('legacy_unavailable'),
  reason: v.literal('offering_identity_unavailable'),
  schemaVersion: v.string(),
  businessId: v.string(),
  slug: v.string(),
  businessName: v.string(),
  category: v.string(),
  location: v.object({
    suburb: v.string(),
    stateTerritory: v.string(),
    postcode: v.optional(v.string()),
  }),
  publicUrl: v.string(),
  manifestUrl: v.string(),
  ucpVersion: v.string(),
  pathKind: v.union(v.literal('ae_hosted_fallback'), v.literal('business_origin_standard')),
  status: v.union(v.literal('unavailable'), v.literal('degraded'), v.literal('available'), v.literal('stale')),
  sourceHash: v.string(),
  sourceVersion: v.string(),
  generatedHash: v.string(),
  bodyHash: v.string(),
  urlHash: v.string(),
  generatedAt: v.number(),
  updatedAt: v.number(),
  degradedReason: v.optional(v.string()),
  suppressedAt: v.optional(v.number()),
  routes: v.array(routeResult),
  services: v.array(legacyManifestServiceResult),
  unsupportedCapabilities: v.object({
    callable: v.literal(false),
    paymentRequired: v.literal(false),
  }),
})

const manifestResult = v.union(currentManifestResult, legacyUnavailableManifestResult)

const readbackResult = v.object({
  businessId: v.string(),
  slug: v.string(),
  manifestUrl: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  sourceHash: v.string(),
  generatedHash: v.string(),
  bodyHash: v.string(),
  urlHash: v.string(),
  routeUrls: v.array(v.string()),
  readAt: v.number(),
})

const attemptResult = v.object({
  attemptId: v.string(),
  businessId: v.string(),
  ucpVersion: v.string(),
  pathKind: v.literal('ae_hosted_fallback'),
  sourceHash: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  status: v.union(v.literal('queued'), v.literal('succeeded'), v.literal('failed'), v.literal('stale')),
  retryCount: v.number(),
  failureCode: v.optional(v.string()),
  failureMessageRedacted: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  generatedHash: v.optional(v.string()),
  bodyHash: v.optional(v.string()),
  urlHash: v.optional(v.string()),
  latestReadback: v.optional(readbackResult),
  staleThresholdAt: v.optional(v.number()),
  repairAction: v.union(v.literal('regenerate_manifest'), v.literal('invalidate_manifest'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

const auditEventResult = v.object({
  eventId: v.string(),
  eventType: v.string(),
  actorKind: v.string(),
  actorRef: v.string(),
  businessId: v.optional(v.string()),
  targetType: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  evidenceRefs: v.array(v.string()),
  redactedPayloadJson: v.string(),
  payloadHash: v.string(),
  failureCode: v.optional(v.string()),
  createdAt: v.number(),
})

const discoveryManifestErrorCodeMembers = [
  v.literal('discovery_manifest_unauthenticated'),
  v.literal('discovery_manifest_csrf_rejected'),
  v.literal('discovery_manifest_wrong_owner'),
  v.literal('discovery_manifest_not_public'),
] as const
const discoveryManifestErrorCode = v.union(...discoveryManifestErrorCodeMembers)
const regenerateResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('discovery_manifest_generated'), v.literal('discovery_manifest_replayed')),
    manifest: manifestResult,
    attempt: attemptResult,
    auditEvent: auditEventResult,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(...discoveryManifestErrorCodeMembers, v.literal('discovery_manifest_failed')),
    retryable: v.boolean(),
    reason: v.string(),
    attempt: v.optional(attemptResult),
    auditEvent: v.optional(auditEventResult),
  })
)

const invalidateResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('discovery_manifest_invalidated'),
    attempts: v.array(attemptResult),
    manifests: v.array(manifestResult),
  }),
  v.object({
    kind: v.literal('error'),
    code: discoveryManifestErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const healthResult = v.object({
  businessId: v.string(),
  sourceState: v.union(v.literal('published'), v.literal('not_public')),
  discoveryStatus: v.union(v.literal('unavailable'), v.literal('degraded'), v.literal('available'), v.literal('stale')),
  latestManifest: v.optional(manifestResult),
  latestAttempt: v.optional(attemptResult),
  affectedPublicSurfaces: v.array(v.string()),
  repairAction: v.union(v.literal('regenerate_manifest'), v.literal('invalidate_manifest'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

const manifestReadResult = v.union(
  v.object({
    kind: v.literal('available'),
    manifest: manifestResult,
  }),
  v.object({
    kind: v.literal('hidden'),
    reason: v.union(v.literal('not_public'), v.literal('no_public_catalog')),
  })
)

const discoveryFileResult = v.object({
  body: v.string(),
  urls: v.array(v.string()),
})

const discoverySlugPageResult = v.object({
  page: v.array(v.string()),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

const DISCOVERY_SITEMAP_PAGE_SIZE = 50
const DISCOVERY_LLMS_SAMPLE_SIZE = 12
const DISCOVERY_INVALIDATION_BATCH_SIZE = 50

const discoveryMutationAuthArgs = {
  operationKey: v.string(),
  correlationId: v.string(),
}
export const regenerateDiscoveryManifest = mutationGeneric({
  args: {
    businessId: v.optional(v.id('businesses')),
    slug: v.optional(v.string()),
    canonicalBaseUrl: v.optional(v.string()),
    ...discoveryMutationAuthArgs,
    ...sourceWriteArgs,
  },
  returns: regenerateResult,
  handler: async (ctx, args): Promise<Infer<typeof regenerateResult>> => {
    const auth = await requireOwnerMutation(ctx, args)
    if (auth.kind === 'error') return auth.error
    const catalog = await publicCatalogForBusiness(ctx.db, auth.business)
    if (catalog === undefined) {
      return discoveryError('discovery_manifest_not_public', 'Catalog is not public or has no published Offerings.')
    }
    const now = Date.now()
    const manifest = buildManifest(catalog, canonicalBaseUrl(args.canonicalBaseUrl), now)
    const existingAttempt = await latestAttemptForBusiness(ctx.db, auth.business._id, manifest.slug, manifest.sourceHash)
    const replayed = existingAttempt?.status === 'succeeded'
      && existingAttempt.sourceHash === manifest.sourceHash
      && existingAttempt.generatedHash === manifest.generatedHash
      && existingAttempt.latestReadback !== undefined
    const [, attempt, auditEvent] = await Promise.all([
      upsertManifest(ctx.db, manifest, auth.business._id),
      upsertSucceededAttempt(ctx.db, manifest, auth.business._id, existingAttempt, now),
      ensureDiscoveryAuditEvent(ctx.db, manifest, auth.business._id, now),
    ])
    return {
      kind: 'ok' as const,
      code: replayed ? 'discovery_manifest_replayed' as const : 'discovery_manifest_generated' as const,
      manifest: manifestForReturn(manifest),
      attempt: attemptForReturn(attempt),
      auditEvent: auditEventForReturn(auditEvent),
    }
  },
})

/** System-callable (no owner gate) discovery-manifest generation for dev seeding. */
export async function seedDiscoveryManifestForBusinessCommand(
  db: DatabaseWriter,
  business: Doc<'businesses'>,
  now: number,
): Promise<'generated' | 'skipped'> {
  const catalog = await publicCatalogForBusiness(db, business)
  if (catalog === undefined) return 'skipped'
  const manifest = buildManifest(catalog, canonicalBaseUrl(undefined), now)
  const existingAttempt = await latestAttemptForBusiness(db, business._id, manifest.slug, manifest.sourceHash)
  await upsertManifest(db, manifest, business._id)
  await upsertSucceededAttempt(db, manifest, business._id, existingAttempt, now)
  await ensureDiscoveryAuditEvent(db, manifest, business._id, now)
  return 'generated'
}

export const invalidateDiscoveryManifest = mutationGeneric({
  args: {
    businessId: v.id('businesses'),
    reasonCode: v.string(),
    ...discoveryMutationAuthArgs,
    ...sourceWriteArgs,
  },
  returns: invalidateResult,
  handler: async (ctx, args): Promise<Infer<typeof invalidateResult>> => {
    const auth = await requireOwnerMutation(ctx, args)
    if (auth.kind === 'error') return auth.error
    const now = Date.now()
    const paginationOpts: PaginationOptions = { cursor: null, numItems: DISCOVERY_INVALIDATION_BATCH_SIZE }
    const manifestsBatch = await invalidateDiscoveryManifestBatch(ctx.db, args.businessId, 'manifests', paginationOpts, args.reasonCode, now)
    const attemptsBatch: {
      attempts: Array<Infer<typeof attemptResult>>
      isDone: boolean
      continueCursor: string | null
    } = await ctx.runMutation(internal.discovery.invalidateDiscoveryManifestAttemptsBatch, {
      businessId: args.businessId,
      reasonCode: args.reasonCode,
      paginationOpts,
      now,
    })
    if (!manifestsBatch.isDone) {
      await ctx.scheduler.runAfter(0, internal.discovery.continueInvalidateDiscoveryManifest, {
        businessId: args.businessId,
        reasonCode: args.reasonCode,
        target: 'manifests',
        paginationOpts: { ...paginationOpts, cursor: manifestsBatch.continueCursor },
        now,
      })
    }
    return {
      kind: 'ok' as const,
      code: 'discovery_manifest_invalidated' as const,
      attempts: attemptsBatch.attempts,
      manifests: manifestsBatch.manifests.map(manifestForReturn),
    }
  },
})

export const invalidateDiscoveryManifestAttemptsBatch = internalMutation({
  args: {
    businessId: v.id('businesses'),
    reasonCode: v.string(),
    paginationOpts: paginationOptsValidator,
    now: v.number(),
  },
  returns: v.object({
    attempts: v.array(attemptResult),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const batch = await invalidateDiscoveryManifestBatch(
      ctx.db,
      args.businessId,
      'attempts',
      args.paginationOpts,
      args.reasonCode,
      args.now,
    )
    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.discovery.continueInvalidateDiscoveryManifest, {
        businessId: args.businessId,
        reasonCode: args.reasonCode,
        target: 'attempts',
        paginationOpts: { ...args.paginationOpts, cursor: batch.continueCursor },
        now: args.now,
      })
    }
    return {
      attempts: batch.attempts.map(attemptForReturn),
      isDone: batch.isDone,
      continueCursor: batch.isDone ? null : batch.continueCursor,
    }
  },
})

export const continueInvalidateDiscoveryManifest = internalMutation({
  args: {
    businessId: v.id('businesses'),
    reasonCode: v.string(),
    target: v.union(v.literal('manifests'), v.literal('attempts')),
    paginationOpts: paginationOptsValidator,
    now: v.number(),
  },
  returns: v.object({
    processed: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batch = await invalidateDiscoveryManifestBatch(ctx.db, args.businessId, args.target, args.paginationOpts, args.reasonCode, args.now)
    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.discovery.continueInvalidateDiscoveryManifest, {
        businessId: args.businessId,
        reasonCode: args.reasonCode,
        target: args.target,
        paginationOpts: { ...args.paginationOpts, cursor: batch.continueCursor },
        now: args.now,
      })
    }
    return {
      processed: batch.manifests.length + batch.attempts.length,
      done: batch.isDone,
    }
  },
})

export const readDiscoveryHealth = queryGeneric({
  args: {
    businessId: v.id('businesses'),
  },
  returns: healthResult,
  handler: async (ctx, args) => readDiscoveryHealthFromDb(ctx.db, args.businessId),
})

export const readCatalogDiscoveryManifest = queryGeneric({
  args: {
    slug: v.string(),
    canonicalBaseUrl: v.optional(v.string()),
    now: v.number(),
  },
  returns: manifestReadResult,
  handler: async (ctx, args): Promise<Infer<typeof manifestReadResult>> => {
    const business = await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', normalizeSlug(args.slug))).unique()
    if (business === null) return { kind: 'hidden' as const, reason: 'no_public_catalog' as const }
    const catalog = await publicCatalogForBusiness(ctx.db, business)
    if (catalog === undefined) return { kind: 'hidden' as const, reason: 'not_public' as const }
    return {
      kind: 'available' as const,
      manifest: manifestForReturn(buildManifest(catalog, canonicalBaseUrl(args.canonicalBaseUrl), args.now)),
    }
  },
})

export const readLlmsTxt = queryGeneric({
  args: {
    canonicalBaseUrl: v.optional(v.string()),
    routingBaseUrl: v.optional(v.string()),
    now: v.optional(v.number()),
    totalBusinesses: v.optional(v.number()),
  },
  returns: discoveryFileResult,
  handler: async (ctx, args) => {
    const result = buildOfferingLlmsTxt(await publicOfferingSupplyForDiscovery(ctx.db), {
      canonicalBaseUrl: canonicalBaseUrl(args.canonicalBaseUrl),
      routingBaseUrl: canonicalBaseUrl(args.routingBaseUrl),
      ...(args.totalBusinesses === undefined ? {} : { totalBusinesses: args.totalBusinesses }),
    })
    return { body: result.body, urls: [...result.urls] }
  },
})

export const readDiscoveryBusinessSlugPage = queryGeneric({
  args: {
    surface: v.union(v.literal('llms'), v.literal('sitemap')),
    paginationOpts: paginationOptsValidator,
  },
  returns: discoverySlugPageResult,
  handler: async (ctx, args) => readDiscoveryBusinessSlugPageFromDb(ctx.db, args.surface, args.paginationOpts),
})

export const readSitemapXml = queryGeneric({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: discoverySlugPageResult,
  handler: async (ctx, args) => readDiscoveryBusinessSlugPageFromDb(ctx.db, 'sitemap', args.paginationOpts),
})

type OwnerMutationArgs = SourceWriteArgs & Readonly<{
  businessId?: Id<'businesses'>
  slug?: string
}>

type OwnerMutationAuth =
  | { kind: 'ok'; actor: Extract<BusinessMutationActor, { kind: 'authenticated_owner' }>; business: Doc<'businesses'> }
  | { kind: 'error'; error: DiscoveryMutationError }

type DiscoveryMutationError = {
  kind: 'error'
  code:
    | 'discovery_manifest_unauthenticated'
    | 'discovery_manifest_csrf_rejected'
    | 'discovery_manifest_wrong_owner'
    | 'discovery_manifest_not_public'
  retryable: boolean
  reason: string
}

type DiscoveryInvalidationTarget = 'manifests' | 'attempts'

type DiscoveryManifest = DiscoveryManifestContract
type LegacyUnavailableDiscoveryManifest = {
  kind: 'legacy_unavailable'
  reason: 'offering_identity_unavailable'
  schemaVersion: string
  businessId: string
  slug: string
  businessName: string
  category: string
  location: {
    suburb: string
    stateTerritory: string
    postcode?: string
  }
  publicUrl: string
  manifestUrl: string
  ucpVersion: string
  pathKind: 'ae_hosted_fallback' | 'business_origin_standard'
  status: 'unavailable' | 'degraded' | 'available' | 'stale'
  sourceHash: string
  sourceVersion: string
  generatedHash: string
  bodyHash: string
  urlHash: string
  generatedAt: number
  updatedAt: number
  degradedReason?: string
  suppressedAt?: number
  routes: DiscoveryManifest['routes']
  services: Array<{
    slug: string
    name: string
    category: string
    summary: string
    serviceArea: string
    hoursOrUnknown: string
    status: 'published'
    capabilities: Array<{
      kind: 'phone_inquiry' | 'quote_request' | 'emergency_callout_interest' | 'ae_hosted_discovery'
      status: 'available' | 'degraded' | 'unavailable' | 'stale'
      firstRequest: {
        mode: 'inquiry_available' | 'quote_request_available' | 'not_available_yet'
        publicDisclosure: string
        publicChannel: 'public_business_contact' | 'ae_status_only' | 'not_available'
        noContactReason?: string
      }
      callable: false
      paymentRequired: false
      reason?: string
    }>
  }>
  unsupportedCapabilities: {
    callable: false
    paymentRequired: false
  }
}

type DiscoveryManifestRead = DiscoveryManifest | LegacyUnavailableDiscoveryManifest

type DiscoveryAttempt = {
  attemptId: string
  businessId: Id<'businesses'>
  ucpVersion: string
  pathKind: 'ae_hosted_fallback'
  sourceHash: string
  sourceVersion: 'public-catalog:v1'
  status: 'queued' | 'succeeded' | 'failed' | 'stale'
  retryCount: number
  failureCode?: string
  failureMessageRedacted?: string
  startedAt: number
  finishedAt?: number
  generatedHash?: string
  bodyHash?: string
  urlHash?: string
  latestReadback?: DiscoveryReadback
  staleThresholdAt?: number
  repairAction: 'regenerate_manifest' | 'invalidate_manifest' | 'no_repair'
  repairResult: 'not_run' | 'succeeded' | 'failed'
}

type DiscoveryAuditEvent = {
  eventId: string
  eventType: string
  actorKind: string
  actorRef: string
  businessId: Id<'businesses'>
  targetType: string
  targetRef: string
  beforeState: string
  afterState: string
  idempotencyKey: string
  correlationId: string
  evidenceRefs: string[]
  redactedPayloadJson: string
  payloadHash: string
  createdAt: number
}

type PublicCatalog = PublicBusinessCatalogApiV2Dto & { sourceHash: string }
type DiscoveryReadback = DiscoveryManifestReadback

type DiscoveryInvalidationBatch = {
  manifests: DiscoveryManifestRead[]
  attempts: DiscoveryAttempt[]
  isDone: boolean
  continueCursor: string | null
}

type ManifestReturn = Infer<typeof manifestResult>
type ManifestOfferingReturn = Infer<typeof manifestOfferingResult>
type ManifestAccessPathReturn = Infer<typeof manifestAccessPathResult>
type ManifestPriceReturn = Infer<typeof manifestPriceResult>
type RouteReturn = Infer<typeof routeResult>
type ReadbackReturn = Infer<typeof readbackResult>
type AttemptReturn = Infer<typeof attemptResult>
type AuditEventReturn = Infer<typeof auditEventResult>

function manifestPriceForReturn(
  price: NonNullable<DiscoveryManifest['offerings'][number]['price']>,
): ManifestPriceReturn {
  if (price.kind === 'quote_only') {
    return {
      kind: price.kind,
      currency: price.currency,
      ...(price.unit === undefined ? {} : { unit: price.unit }),
      taxTreatment: price.taxTreatment,
    }
  }
  if (price.kind === 'fixed' || price.kind === 'from') {
    return {
      kind: price.kind,
      amount: { ...price.amount },
      ...(price.unit === undefined ? {} : { unit: price.unit }),
      taxTreatment: price.taxTreatment,
    }
  }
  if (price.kind === 'range') {
    return {
      kind: price.kind,
      minimum: { ...price.minimum },
      maximum: { ...price.maximum },
      ...(price.unit === undefined ? {} : { unit: price.unit }),
      taxTreatment: price.taxTreatment,
    }
  }
  throw new Error('unsupported discovery price kind')
}

function manifestAccessPathForReturn(
  path: DiscoveryManifest['offerings'][number]['accessPaths'][number],
): ManifestAccessPathReturn {
  if (path.kind === 'human_request') {
    return {
      accessPathRef: path.accessPathRef,
      offeringRevision: path.offeringRevision,
      kind: 'human_request',
      channel: path.channel,
      disclosure: path.disclosure,
      ...(path.url === undefined ? {} : { url: path.url }),
    }
  }

  return {
    accessPathRef: path.accessPathRef,
    offeringRevision: path.offeringRevision,
    kind: 'external_operation',
    name: path.name,
    summary: path.summary,
    url: path.url,
    ...(path.method === undefined ? {} : { method: path.method }),
    ...(path.documentationUrl === undefined ? {} : { documentationUrl: path.documentationUrl }),
    ...(path.interfaceDescription === undefined
      ? {}
      : {
          interfaceDescription: {
            format: path.interfaceDescription.format,
            ...(path.interfaceDescription.url === undefined ? {} : { url: path.interfaceDescription.url }),
          },
        }),
    ...(path.authenticationSummary === undefined ? {} : { authenticationSummary: path.authenticationSummary }),
    ...(path.pricingSummary === undefined ? {} : { pricingSummary: path.pricingSummary }),
    provenance: path.provenance,
  }
}

function manifestOfferingForReturn(
  offering: DiscoveryManifest['offerings'][number],
): ManifestOfferingReturn {
  return {
    offeringRef: offering.offeringRef,
    revision: offering.revision,
    name: offering.name,
    category: offering.category,
    summary: offering.summary,
    ...(offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: offering.serviceAreaSummary }),
    ...(offering.availabilitySummary === undefined ? {} : { availabilitySummary: offering.availabilitySummary }),
    ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }),
    ...(offering.price === undefined ? {} : { price: manifestPriceForReturn(offering.price) }),
    accessPaths: offering.accessPaths.map(manifestAccessPathForReturn),
    support: {
      integrated: offering.support.integrated,
      aeSupportedAction: offering.support.aeSupportedAction,
      ...(offering.support.observedAt === undefined ? {} : { observedAt: offering.support.observedAt }),
      ...(offering.support.validUntil === undefined ? {} : { validUntil: offering.support.validUntil }),
    },
  }
}

function manifestForReturn(manifest: DiscoveryManifestRead): ManifestReturn {
  if ('services' in manifest) {
    return {
      kind: manifest.kind,
      reason: manifest.reason,
      schemaVersion: manifest.schemaVersion,
      businessId: manifest.businessId,
      slug: manifest.slug,
      businessName: manifest.businessName,
      category: manifest.category,
      location: {
        suburb: manifest.location.suburb,
        stateTerritory: manifest.location.stateTerritory,
        ...(manifest.location.postcode === undefined ? {} : { postcode: manifest.location.postcode }),
      },
      publicUrl: manifest.publicUrl,
      manifestUrl: manifest.manifestUrl,
      ucpVersion: manifest.ucpVersion,
      pathKind: manifest.pathKind,
      status: manifest.status,
      sourceHash: manifest.sourceHash,
      sourceVersion: manifest.sourceVersion,
      generatedHash: manifest.generatedHash,
      bodyHash: manifest.bodyHash,
      urlHash: manifest.urlHash,
      generatedAt: manifest.generatedAt,
      updatedAt: manifest.updatedAt,
      ...(manifest.degradedReason === undefined ? {} : { degradedReason: manifest.degradedReason }),
      ...(manifest.suppressedAt === undefined ? {} : { suppressedAt: manifest.suppressedAt }),
      routes: manifest.routes.map((route): RouteReturn => ({
        kind: route.kind,
        url: route.url,
        routeTested: true,
      })),
      services: manifest.services,
      unsupportedCapabilities: { ...manifest.unsupportedCapabilities },
    }
  }
  return {
    schemaVersion: manifest.schemaVersion,
    businessCatalogSchemaVersion: manifest.businessCatalogSchemaVersion,
    businessId: manifest.businessId,
    slug: manifest.slug,
    businessName: manifest.businessName,
    category: manifest.category,
    businessContext: manifest.businessContext,
    publicUrl: manifest.publicUrl,
    manifestUrl: manifest.manifestUrl,
    ucpVersion: manifest.ucpVersion,
    pathKind: manifest.pathKind,
    disposition: manifest.disposition,
    ...(manifest.sourceHash === undefined ? {} : { sourceHash: manifest.sourceHash }),
    sourceVersion: manifest.sourceVersion,
    generatedHash: manifest.generatedHash,
    bodyHash: manifest.bodyHash,
    urlHash: manifest.urlHash,
    generatedAt: manifest.generatedAt,
    observedAt: manifest.observedAt,
    routes: manifest.routes.map((route): RouteReturn => ({
      kind: route.kind,
      url: route.url,
      routeTested: true,
    })),
    offerings: manifest.offerings.map(manifestOfferingForReturn),
    ...(manifest.degradedReason === undefined ? {} : { degradedReason: manifest.degradedReason }),
    ...(manifest.suppressedAt === undefined ? {} : { suppressedAt: manifest.suppressedAt }),
  }

}

function readbackForReturn(readback: DiscoveryReadback): ReadbackReturn {
  return {
    businessId: readback.businessId,
    slug: readback.slug,
    manifestUrl: readback.manifestUrl,
    sourceVersion: readback.sourceVersion,
    sourceHash: readback.sourceHash,
    generatedHash: readback.generatedHash,
    bodyHash: readback.bodyHash,
    urlHash: readback.urlHash,
    routeUrls: [...readback.routeUrls],
    readAt: readback.readAt,
  }
}

function attemptForReturn(attempt: DiscoveryAttempt): AttemptReturn {
  return {
    attemptId: attempt.attemptId,
    businessId: attempt.businessId,
    ucpVersion: attempt.ucpVersion,
    pathKind: attempt.pathKind,
    sourceHash: attempt.sourceHash,
    sourceVersion: attempt.sourceVersion,
    status: attempt.status,
    retryCount: attempt.retryCount,
    ...(attempt.failureCode === undefined ? {} : { failureCode: attempt.failureCode }),
    ...(attempt.failureMessageRedacted === undefined ? {} : { failureMessageRedacted: attempt.failureMessageRedacted }),
    startedAt: attempt.startedAt,
    ...(attempt.finishedAt === undefined ? {} : { finishedAt: attempt.finishedAt }),
    ...(attempt.generatedHash === undefined ? {} : { generatedHash: attempt.generatedHash }),
    ...(attempt.bodyHash === undefined ? {} : { bodyHash: attempt.bodyHash }),
    ...(attempt.urlHash === undefined ? {} : { urlHash: attempt.urlHash }),
    ...(attempt.latestReadback === undefined ? {} : { latestReadback: readbackForReturn(attempt.latestReadback) }),
    ...(attempt.staleThresholdAt === undefined ? {} : { staleThresholdAt: attempt.staleThresholdAt }),
    repairAction: attempt.repairAction,
    repairResult: attempt.repairResult,
  }
}

function auditEventForReturn(event: DiscoveryAuditEvent): AuditEventReturn {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    actorKind: event.actorKind,
    actorRef: event.actorRef,
    businessId: event.businessId,
    targetType: event.targetType,
    targetRef: event.targetRef,
    ...(event.beforeState === '' ? {} : { beforeState: event.beforeState }),
    ...(event.afterState === '' ? {} : { afterState: event.afterState }),
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
    evidenceRefs: [...event.evidenceRefs],
    redactedPayloadJson: event.redactedPayloadJson,
    payloadHash: event.payloadHash,
    createdAt: event.createdAt,
  }
}

async function requireOwnerMutation(ctx: MutationCtx, args: OwnerMutationArgs): Promise<OwnerMutationAuth> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'discovery_repair')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'error', error: discoveryError('discovery_manifest_csrf_rejected', sourceWrite.reason) }
  }
  const actor = await resolveBusinessActor(ctx, args)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'error', error: discoveryError('discovery_manifest_unauthenticated', 'Authentication is required for discovery mutations.') }
  }
  const business = await findBusiness(ctx.db, args)
  if (business === null) {
    return { kind: 'error', error: discoveryError('discovery_manifest_not_public', 'Business was not found.') }
  }
  const owner = await ctx.db.get(business.ownerId)
  if (owner === null || owner.clerkUserId !== actor.clerkUserId) {
    return { kind: 'error', error: discoveryError('discovery_manifest_wrong_owner', 'Only the source-bound owner can mutate discovery state.') }
  }
  return { kind: 'ok', actor, business }
}

async function findBusiness(db: DatabaseReader, args: OwnerMutationArgs): Promise<Doc<'businesses'> | null> {
  if (args.businessId !== undefined) return db.get(args.businessId)
  if (args.slug === undefined) return null
  return db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', normalizeSlug(args.slug ?? ''))).unique()
}

function discoveryError(
  code: DiscoveryMutationError['code'],
  reason: string,
  retryable = false
): DiscoveryMutationError {
  return { kind: 'error', code, retryable, reason }
}

async function invalidateDiscoveryManifestBatch(
  db: DatabaseWriter,
  businessId: Id<'businesses'>,
  target: DiscoveryInvalidationTarget,
  paginationOpts: PaginationOptions,
  reasonCode: string,
  now: number,
): Promise<DiscoveryInvalidationBatch> {
  const manifests: DiscoveryManifestRead[] = []
  const attempts: DiscoveryAttempt[] = []
  if (target === 'manifests') {
    const page = await db.query('discoveryManifests')
      .withIndex('by_business_version', (query) => query.eq('businessId', businessId))
      .paginate(paginationOpts)
    for (const manifestDoc of page.page) {
      let current: DiscoveryManifestRead | undefined
      try {
        current = manifestFromDoc(manifestDoc)
      } catch {
        current = undefined
      }
      if ('services' in manifestDoc) {
        await db.patch(manifestDoc._id, {
          status: 'stale',
          degradedReason: reasonCode,
          suppressedAt: now,
        })
        if (current !== undefined && 'services' in current) {
          manifests.push({ ...current, status: 'stale', degradedReason: reasonCode, suppressedAt: now })
        }
      } else {
        await db.patch(manifestDoc._id, {
          disposition: 'stale',
          degradedReason: reasonCode,
          suppressedAt: now,
        })
        if (current !== undefined && !('services' in current)) {
          manifests.push({ ...current, disposition: 'stale', degradedReason: reasonCode, suppressedAt: now })
        }
      }
    }
    return {
      manifests,
      attempts,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    }
  }
  const page = await db.query('discoveryManifestAttempts')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId))
    .paginate(paginationOpts)
  for (const attemptDoc of page.page) {
    await db.patch(attemptDoc._id, {
      status: 'stale',
      finishedAt: now,
      staleThresholdAt: now,
      failureCode: reasonCode,
      repairAction: 'invalidate_manifest',
      repairResult: 'succeeded',
    })
    try {
      const next = {
        ...attemptFromDoc(attemptDoc),
        status: 'stale' as const,
        finishedAt: now,
        staleThresholdAt: now,
        failureCode: reasonCode,
        repairAction: 'invalidate_manifest' as const,
        repairResult: 'succeeded' as const,
      }
      attempts.push(next)
    } catch {
      // The row is still invalidated; malformed legacy evidence is not projected.
    }
  }
  return {
    manifests,
    attempts,
    isDone: page.isDone,
    continueCursor: page.isDone ? null : page.continueCursor,
  }
}
async function publicCatalogForBusiness(db: DatabaseReader, business: Doc<'businesses'>): Promise<PublicCatalog | undefined> {
  if (business.publicStatus !== 'published') return undefined
  if (await hasActiveBusinessSuppression(db, business._id)) return undefined
  const snapshot = await db.query('businessSupplyProjectionSnapshots')
    .withIndex('by_businessId', (query) => query.eq('businessId', business._id))
    .unique()
  if (snapshot === null) return undefined
  const projection = readDiscoveryProjectionSnapshot(snapshot, business)
  if (projection === undefined) return undefined
  const projected = projectBusinessSupplyToPublicApi(projection, Date.now())
  return {
    ...projected,
    disposition: snapshot.status === 'projection_pending' ? 'stale' : projected.disposition,
    sourceHash: snapshot.sourceDigest,
  }
}

type DiscoverySlugSurface = 'llms' | 'sitemap'

async function publicDiscoverySlugForBusiness(
  db: DatabaseReader,
  business: Doc<'businesses'>,
  surface: DiscoverySlugSurface,
): Promise<string | undefined> {
  void surface
  if (business.publicStatus !== 'published') return undefined
  if (await hasActiveBusinessSuppression(db, business._id)) return undefined
  const snapshot = await db.query('businessSupplyProjectionSnapshots')
    .withIndex('by_businessId', (query) => query.eq('businessId', business._id))
    .unique()
  if (snapshot === null) return undefined
  return readDiscoveryProjectionSnapshot(snapshot, business) === undefined ? undefined : business.slug
}

async function readDiscoveryBusinessSlugPageFromDb(
  db: DatabaseReader,
  surface: DiscoverySlugSurface,
  paginationOpts: PaginationOptions,
): Promise<{ page: string[]; isDone: boolean; continueCursor: string }> {
  const page = await db
    .query('businesses')
    .withIndex('by_publicStatus_slug', (query) => query.eq('publicStatus', 'published'))
    .paginate(paginationOpts)
  const slugs = await Promise.all(page.page.map((business) => publicDiscoverySlugForBusiness(db, business, surface)))
  return {
    page: slugs.filter((slug): slug is string => slug !== undefined),
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  }
}

async function publicOfferingSupplyForDiscovery(
  db: DatabaseReader,
): Promise<PublicBusinessCatalogApiV2Dto[]> {
  const businesses = await db
    .query('businesses')
    .withIndex('by_publicStatus_slug', (query) => query.eq('publicStatus', 'published'))
    .take(DISCOVERY_LLMS_SAMPLE_SIZE)
  const results = await Promise.all(businesses.map(async (business) => {
    if (await hasActiveBusinessSuppression(db, business._id)) return undefined
    const snapshot = await db.query('businessSupplyProjectionSnapshots')
      .withIndex('by_businessId', (query) => query.eq('businessId', business._id))
      .unique()
    if (snapshot === null) return undefined
    const projection = readDiscoveryProjectionSnapshot(snapshot, business)
    if (projection === undefined) return undefined
    const projected = projectBusinessSupplyToPublicApi(projection, Date.now())
    return snapshot.status === 'projection_pending'
      ? { ...projected, disposition: 'stale' as const }
      : projected
  }))
  return results.filter((result): result is PublicBusinessCatalogApiV2Dto => result !== undefined)
}

function readDiscoveryProjectionSnapshot(
  snapshot: Doc<'businessSupplyProjectionSnapshots'>,
  business: Doc<'businesses'>,
): ReturnType<typeof readBusinessSupplyProjectionSnapshot> | undefined {
  const projectionValue = 'projection' in snapshot ? snapshot.projection : snapshot.projectionJson
  try {
    const projection = readBusinessSupplyProjectionSnapshot(
      projectionValue,
      'discovery',
      String(business._id),
      business.slug,
      {
        businessId: snapshot.businessId,
        sourceRevision: snapshot.sourceRevision,
        sourceDigest: snapshot.sourceDigest,
        observedAt: snapshot.observedAt,
        ...(snapshot.status === 'projection_pending' ? {} : { disposition: snapshot.disposition }),
      },
    )
    return snapshot.status === 'projection_pending'
      ? { ...projection, disposition: 'stale' as const }
      : projection
  } catch {
    return undefined
  }
}

function buildManifest(catalog: PublicCatalog, baseUrl: string, now: number): DiscoveryManifest {
  const result = buildCatalogDiscoveryManifest({
    catalog,
    canonicalBaseUrl: baseUrl,
    now,
    sourceHash: brandNonEmpty(catalog.sourceHash, 'SourceHash'),
  })
  if (result.kind === 'hidden') throw new Error('discovery_manifest_catalog_hidden')
  return result.manifest
}

async function upsertManifest(db: DatabaseWriter, manifest: DiscoveryManifest, businessId: Id<'businesses'>): Promise<void> {
  const sourceHash = manifest.sourceHash ?? brandNonEmpty(canonicalDigest(manifest), 'SourceHash')
  const existingRows = await db
    .query('discoveryManifests')
    .withIndex('by_business_version', (query) => query.eq('businessId', businessId))
    .take(50)
  const existing = existingRows.find((row) => row.ucpVersion === manifest.ucpVersion)
    ?? existingRows.find((row) => 'services' in row)
  const patch = manifestPatch(manifest, businessId, sourceHash)
  if (existing === undefined) await db.insert('discoveryManifests', patch)
  else if ('services' in existing) await db.replace(existing._id, patch)
  else await db.patch(existing._id, patch)
}

async function upsertSucceededAttempt(
  db: DatabaseWriter,
  manifest: DiscoveryManifest,
  businessId: Id<'businesses'>,
  existing: DiscoveryAttempt | undefined,
  now: number
): Promise<DiscoveryAttempt> {
  const sourceHash = manifest.sourceHash ?? brandNonEmpty(canonicalDigest(manifest), 'SourceHash')
  const readback = readbackForManifest(manifest, businessId, sourceHash, now)
  const attempt = {
    attemptId: `discovery:manifest:${businessId}:${sourceHash}:v1`,
    businessId,
    ucpVersion: manifest.ucpVersion,
    pathKind: 'ae_hosted_fallback' as const,
    sourceHash,
    sourceVersion: 'public-catalog:v1' as const,
    status: 'succeeded' as const,
    retryCount: existing?.status === 'failed' ? existing.retryCount + 1 : existing?.retryCount ?? 0,
    startedAt: existing?.startedAt ?? now,
    finishedAt: now,
    generatedHash: manifest.generatedHash,
    bodyHash: manifest.bodyHash,
    urlHash: manifest.urlHash,
    latestReadback: readback,
    staleThresholdAt: now + 3_600_000,
    repairAction: 'no_repair' as const,
    repairResult: 'succeeded' as const,
  }
  const existingDoc = await db.query('discoveryManifestAttempts')
    .withIndex('by_attemptId', (query) => query.eq('attemptId', attempt.attemptId))
    .unique()
  if (existingDoc === null) await db.insert('discoveryManifestAttempts', attemptPatch(attempt))
  else await db.patch(existingDoc._id, attemptPatch(attempt))
  return attempt
}

async function ensureDiscoveryAuditEvent(
  db: DatabaseWriter,
  manifest: DiscoveryManifest,
  businessId: Id<'businesses'>,
  now: number
): Promise<DiscoveryAuditEvent> {
  const sourceHash = manifest.sourceHash ?? brandNonEmpty(canonicalDigest(manifest), 'SourceHash')
  const eventId = `audit:discovery.generated:${businessId}:${sourceHash}`
  const existing = await db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', eventId)).unique()
  if (existing !== null) return auditFromDoc(existing)
  const redactedPayload = {
    bodyHash: manifest.bodyHash,
    routeCount: manifest.routes.length,
    schemaVersion: manifest.schemaVersion,
    slug: manifest.slug,
    urlHash: manifest.urlHash,
  }
  const event = {
    eventId,
    eventType: 'discovery.generated' as const,
    actorKind: 'system' as const,
    actorRef: 'discovery',
    businessId,
    targetType: 'discovery_manifest' as const,
    targetRef: businessId,
    beforeState: 'queued',
    afterState: 'available',
    idempotencyKey: `op:discovery.generated:${businessId}:${sourceHash}`,
    correlationId: `corr:discovery.generated:${businessId}:${sourceHash}`,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(redactedPayload),
    payloadHash: canonicalDigest(redactedPayload),
    createdAt: now,
  }
  await db.insert('auditEvents', event)
  return event
}

async function readDiscoveryHealthFromDb(
  db: DatabaseReader,
  businessId: Id<'businesses'>,
): Promise<Infer<typeof healthResult>> {
  const business = await db.get(businessId)
  const [catalog, latestAttempt, latestManifest] = await Promise.all([
    business === null ? Promise.resolve<PublicCatalog | undefined>(undefined) : publicCatalogForBusiness(db, business),
    business === null ? Promise.resolve<DiscoveryAttempt | undefined>(undefined) : latestAttemptForBusiness(db, businessId, business.slug),
    latestManifestForBusiness(db, businessId),
  ])
  const sourceHash = catalog?.sourceHash
  const discoveryStatus = healthStatus(catalog !== undefined, latestAttempt, sourceHash)
  return {
    businessId,
    sourceState: catalog === undefined ? 'not_public' as const : 'published' as const,
    discoveryStatus,
    ...(latestManifest === undefined ? {} : { latestManifest: manifestForReturn(latestManifest) }),
    ...(latestAttempt === undefined ? {} : { latestAttempt: attemptForReturn(latestAttempt) }),
    affectedPublicSurfaces: latestManifest?.routes.map((route) => route.url) ?? [],
    repairAction: latestAttempt?.repairAction ?? (catalog === undefined ? 'no_repair' as const : 'regenerate_manifest' as const),
    repairResult: latestAttempt?.repairResult ?? 'not_run' as const,
  }
}

async function latestAttemptForBusiness(
  db: DatabaseReader,
  businessId: Id<'businesses'>,
  expectedSlug?: string,
  expectedSourceHash?: string,
): Promise<DiscoveryAttempt | undefined> {
  const latest = await db.query('discoveryManifestAttempts')
    .withIndex('by_business_startedAt', (query) => query.eq('businessId', businessId))
    .order('desc')
    .first()
  if (latest === null) return undefined
  try {
    return attemptFromDoc(latest, businessId, expectedSlug, expectedSourceHash)
  } catch {
    return undefined
  }
}

async function latestManifestForBusiness(db: DatabaseReader, businessId: Id<'businesses'>): Promise<DiscoveryManifestRead | undefined> {
  const latest = await db.query('discoveryManifests')
    .withIndex('by_business_generatedAt', (query) => query.eq('businessId', businessId))
    .order('desc')
    .first()
  if (latest === null) return undefined
  try {
    return manifestFromDoc(latest)
  } catch {
    return undefined
  }
}

function healthStatus(
  sourceAvailable: boolean,
  attempt: DiscoveryAttempt | undefined,
  sourceHash: string | undefined
): 'unavailable' | 'degraded' | 'available' | 'stale' {
  if (!sourceAvailable) return 'unavailable'
  if (attempt === undefined) return 'degraded'
  if (sourceHash !== undefined && attempt.sourceHash !== sourceHash) return 'stale'
  if (attempt.status === 'succeeded') return 'available'
  return attempt.status === 'stale' ? 'stale' : 'degraded'
}

function manifestPatch(manifest: DiscoveryManifest, businessId: Id<'businesses'>, sourceHash: string) {
  return {
    schemaVersion: manifest.schemaVersion,
    businessCatalogSchemaVersion: manifest.businessCatalogSchemaVersion,
    businessId,
    slug: manifest.slug,
    businessName: manifest.businessName,
    category: manifest.category,
    businessContext: manifest.businessContext,
    publicUrl: manifest.publicUrl,
    manifestUrl: manifest.manifestUrl,
    ucpVersion: manifest.ucpVersion,
    pathKind: manifest.pathKind,
    disposition: manifest.disposition,
    sourceHash,
    sourceVersion: manifest.sourceVersion,
    generatedHash: manifest.generatedHash,
    bodyHash: manifest.bodyHash,
    urlHash: manifest.urlHash,
    generatedAt: manifest.generatedAt,
    routes: manifest.routes.map((route): RouteReturn => ({
      kind: route.kind,
      url: route.url,
      routeTested: true,
    })),
    offerings: manifest.offerings.map(manifestOfferingForReturn),
    observedAt: manifest.observedAt,
    ...(manifest.degradedReason === undefined ? {} : { degradedReason: manifest.degradedReason }),
    ...(manifest.suppressedAt === undefined ? {} : { suppressedAt: manifest.suppressedAt }),
  }
}


function attemptPatch(attempt: DiscoveryAttempt) {
  return {
    attemptId: attempt.attemptId,
    businessId: attempt.businessId,
    ucpVersion: attempt.ucpVersion,
    pathKind: attempt.pathKind,
    sourceHash: attempt.sourceHash,
    sourceVersion: attempt.sourceVersion,
    status: attempt.status,
    retryCount: attempt.retryCount,
    ...(attempt.failureCode === undefined ? {} : { failureCode: attempt.failureCode }),
    ...(attempt.failureMessageRedacted === undefined ? {} : { failureMessageRedacted: attempt.failureMessageRedacted }),
    startedAt: attempt.startedAt,
    ...(attempt.finishedAt === undefined ? {} : { finishedAt: attempt.finishedAt }),
    ...(attempt.generatedHash === undefined ? {} : { generatedHash: attempt.generatedHash }),
    ...(attempt.bodyHash === undefined ? {} : { bodyHash: attempt.bodyHash }),
    ...(attempt.urlHash === undefined ? {} : { urlHash: attempt.urlHash }),
    ...(attempt.latestReadback === undefined ? {} : {
      latestReadback: {
        businessId: attempt.businessId,
        slug: attempt.latestReadback.slug,
        manifestUrl: attempt.latestReadback.manifestUrl,
        sourceVersion: attempt.latestReadback.sourceVersion,
        sourceHash: attempt.latestReadback.sourceHash,
        generatedHash: attempt.latestReadback.generatedHash,
        bodyHash: attempt.latestReadback.bodyHash,
        urlHash: attempt.latestReadback.urlHash,
        routeUrls: [...attempt.latestReadback.routeUrls],
        readAt: attempt.latestReadback.readAt,
      },
      latestManifestUrl: attempt.latestReadback.manifestUrl,
      latestRouteUrls: [...attempt.latestReadback.routeUrls],
    }),
    ...(attempt.staleThresholdAt === undefined ? {} : { staleThresholdAt: attempt.staleThresholdAt }),
    repairAction: attempt.repairAction,
    repairResult: attempt.repairResult,
  }
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label}_invalid`)
  return value
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label}_invalid`)
  return value
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value, label)
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}_invalid`)
  return value
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  return requiredNumber(value, label)
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label}_invalid`)
  return value
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label}_invalid`)
  return value
}

function readCatalogSchemaVersion(value: unknown): PublicBusinessCatalogApiV2Dto['schemaVersion'] {
  if (value === 'public-business-catalog-api:v2') return value
  throw new Error('discovery_catalog_schema_version_invalid')
}
function readCurrentManifestSchemaVersion(value: unknown): DiscoveryManifest['schemaVersion'] | undefined {
  return value === 'ae-ucp-fallback:v1' ? value : undefined
}

function readCurrentManifestPathKind(value: unknown): DiscoveryManifest['pathKind'] | undefined {
  return value === 'ae_hosted_fallback' ? value : undefined
}

function readCurrentManifestSourceVersion(value: unknown): DiscoveryManifest['sourceVersion'] | undefined {
  return value === 'public-catalog:v1' ? value : undefined
}

function readManifestRouteKind(value: unknown): DiscoveryManifest['routes'][number]['kind'] {
  if (value === 'business_page' || value === 'ucp_manifest' || value === 'api_detail') return value
  throw new Error('discovery_manifest_route_kind_invalid')
}

function readManifestDisposition(value: unknown): DiscoveryManifest['disposition'] {
  if (value === 'current' || value === 'partial' || value === 'stale') return value
  throw new Error('discovery_manifest_disposition_invalid')
}

type ManifestAccessPath = DiscoveryManifest['offerings'][number]['accessPaths'][number]

function readManifestAccessPathKind(value: unknown): ManifestAccessPath['kind'] {
  if (value === 'human_request' || value === 'external_operation') return value
  throw new Error('discovery_manifest_access_path_kind_invalid')
}

function readHumanRequestChannel(value: unknown): Extract<ManifestAccessPath, { kind: 'human_request' }>['channel'] {
  if (value === 'phone' || value === 'website' || value === 'ae_inquiry') return value
  throw new Error('discovery_manifest_human_channel_invalid')
}

function readExternalOperationProvenance(
  value: unknown,
): Extract<ManifestAccessPath, { kind: 'external_operation' }>['provenance'] {
  if (value === 'business_declared' || value === 'publicly_observed') return value
  throw new Error('discovery_manifest_provenance_invalid')
}

type ManifestPrice = NonNullable<DiscoveryManifest['offerings'][number]['price']>

function readManifestPriceKind(value: unknown): ManifestPrice['kind'] {
  if (value === 'fixed' || value === 'from' || value === 'range' || value === 'quote_only') return value
  throw new Error('discovery_manifest_price_kind_invalid')
}

function readManifestPriceUnit(value: unknown): ManifestPrice['unit'] {
  if (value === undefined) return undefined
  if (value === 'job' || value === 'hour' || value === 'visit' || value === 'item' || value === 'day' || value === 'week' || value === 'month') {
    return value
  }
  throw new Error('discovery_manifest_price_unit_invalid')
}

function readManifestTaxTreatment(value: unknown): ManifestPrice['taxTreatment'] {
  if (value === 'inclusive' || value === 'exclusive' || value === 'unstated') return value
  throw new Error('discovery_manifest_tax_treatment_invalid')
}

function readManifestRoute(value: unknown): DiscoveryManifest['routes'][number] {
  const row = requiredRecord(value, 'discovery_manifest_route')
  if (row.routeTested !== true) throw new Error('discovery_manifest_route_not_tested')
  return {
    kind: readManifestRouteKind(row.kind),
    url: requiredString(row.url, 'discovery_manifest_route_url'),
    routeTested: true,
  }
}

function readManifestPrice(value: unknown): ManifestPrice {
  const row = requiredRecord(value, 'discovery_manifest_price')
  const kind = readManifestPriceKind(row.kind)
  const allowedFields = kind === 'quote_only'
    ? ['kind', 'currency', 'unit', 'taxTreatment']
    : kind === 'fixed' || kind === 'from'
      ? ['kind', 'amount', 'unit', 'taxTreatment']
      : ['kind', 'minimum', 'maximum', 'unit', 'taxTreatment']
  if (Object.keys(row).some((field) => !allowedFields.includes(field))) {
    throw new Error('discovery_manifest_price_invalid')
  }
  const unit = readManifestPriceUnit(row.unit)
  const taxTreatment = readManifestTaxTreatment(row.taxTreatment)
  if (kind === 'quote_only') {
    return {
      kind,
      currency: requiredString(row.currency, 'discovery_manifest_price_currency'),
      ...(unit === undefined ? {} : { unit }),
      taxTreatment,
    }
  }
  if (kind === 'fixed' || kind === 'from') {
    return {
      kind,
      amount: readManifestExactAmount(row.amount, 'discovery_manifest_price_amount_invalid'),
      ...(unit === undefined ? {} : { unit }),
      taxTreatment,
    }
  }
  const minimum = readManifestExactAmount(row.minimum, 'discovery_manifest_price_minimum_invalid')
  const maximum = readManifestExactAmount(row.maximum, 'discovery_manifest_price_maximum_invalid')
  const comparison = compareExactAmounts(minimum, maximum)
  if (comparison === undefined || comparison > 0) throw new Error('discovery_manifest_price_range_invalid')
  return {
    kind,
    minimum,
    maximum,
    ...(unit === undefined ? {} : { unit }),
    taxTreatment,
  }
}

function readManifestExactAmount(value: unknown, error: string) {
  const parsed = exactAmountSchema.safeParse(value)
  if (!parsed.success) throw new Error(error)
  return parsed.data
}

function readManifestAccessPath(value: unknown): ManifestAccessPath {
  const row = requiredRecord(value, 'discovery_manifest_access_path')
  const accessPathRef = requiredString(row.accessPathRef, 'discovery_manifest_access_path_ref')
  const offeringRevision = requiredNumber(row.offeringRevision, 'discovery_manifest_access_path_offering_revision')
  const kind = readManifestAccessPathKind(row.kind)
  if (kind === 'human_request') {
    const url = optionalString(row.url, 'discovery_manifest_access_path_url')
    return {
      accessPathRef,
      offeringRevision,
      kind,
      channel: readHumanRequestChannel(row.channel),
      disclosure: requiredString(row.disclosure, 'discovery_manifest_access_path_disclosure'),
      ...(url === undefined ? {} : { url }),
    }
  }

  const method = optionalString(row.method, 'discovery_manifest_access_path_method')
  const documentationUrl = optionalString(row.documentationUrl, 'discovery_manifest_access_path_documentation_url')
  const authenticationSummary = optionalString(row.authenticationSummary, 'discovery_manifest_access_path_authentication')
  const pricingSummary = optionalString(row.pricingSummary, 'discovery_manifest_access_path_pricing')
  const interfaceValue = row.interfaceDescription === undefined
    ? undefined
    : requiredRecord(row.interfaceDescription, 'discovery_manifest_access_path_interface')
  const interfaceUrl = interfaceValue === undefined
    ? undefined
    : optionalString(interfaceValue.url, 'discovery_manifest_access_path_interface_url')
  return {
    accessPathRef,
    offeringRevision,
    kind,
    name: requiredString(row.name, 'discovery_manifest_access_path_name'),
    summary: requiredString(row.summary, 'discovery_manifest_access_path_summary'),
    url: requiredString(row.url, 'discovery_manifest_access_path_url'),
    ...(method === undefined ? {} : { method }),
    ...(documentationUrl === undefined ? {} : { documentationUrl }),
    ...(interfaceValue === undefined
      ? {}
      : {
          interfaceDescription: {
            format: requiredString(interfaceValue.format, 'discovery_manifest_access_path_interface_format'),
            ...(interfaceUrl === undefined ? {} : { url: interfaceUrl }),
          },
        }),
    ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
    ...(pricingSummary === undefined ? {} : { pricingSummary }),
    provenance: readExternalOperationProvenance(row.provenance),
  }
}

function readManifestOffering(value: unknown): DiscoveryManifest['offerings'][number] {
  const row = requiredRecord(value, 'discovery_manifest_offering')
  const serviceAreaSummary = optionalString(row.serviceAreaSummary, 'discovery_manifest_offering_area')
  const availabilitySummary = optionalString(row.availabilitySummary, 'discovery_manifest_offering_availability')
  const pricingSummary = optionalString(row.pricingSummary, 'discovery_manifest_offering_pricing')
  const price = row.price === undefined ? undefined : readManifestPrice(row.price)
  const support = requiredRecord(row.support, 'discovery_manifest_offering_support')
  const observedAt = optionalNumber(support.observedAt, 'discovery_manifest_offering_observed_at')
  const validUntil = optionalNumber(support.validUntil, 'discovery_manifest_offering_valid_until')
  return {
    offeringRef: requiredString(row.offeringRef, 'discovery_manifest_offering_ref'),
    revision: requiredNumber(row.revision, 'discovery_manifest_offering_revision'),
    name: requiredString(row.name, 'discovery_manifest_offering_name'),
    category: requiredString(row.category, 'discovery_manifest_offering_category'),
    summary: requiredString(row.summary, 'discovery_manifest_offering_summary'),
    ...(serviceAreaSummary === undefined ? {} : { serviceAreaSummary }),
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    ...(pricingSummary === undefined ? {} : { pricingSummary }),
    ...(price === undefined ? {} : { price }),
    accessPaths: requiredArray(row.accessPaths, 'discovery_manifest_offering_access_paths').map(readManifestAccessPath),
    support: {
      integrated: requiredBoolean(support.integrated, 'discovery_manifest_offering_integrated'),
      aeSupportedAction: requiredBoolean(support.aeSupportedAction, 'discovery_manifest_offering_supported_action'),
      ...(observedAt === undefined ? {} : { observedAt }),
      ...(validUntil === undefined ? {} : { validUntil }),
    },
  }
}

function readAttemptStatus(value: unknown): DiscoveryAttempt['status'] {
  if (value === 'queued' || value === 'succeeded' || value === 'failed' || value === 'stale') return value
  throw new Error('discovery_attempt_status_invalid')
}

function readRepairAction(value: unknown): DiscoveryAttempt['repairAction'] {
  if (value === 'regenerate_manifest' || value === 'invalidate_manifest' || value === 'no_repair') return value
  throw new Error('discovery_repair_action_invalid')
}

function readRepairResult(value: unknown): DiscoveryAttempt['repairResult'] {
  if (value === 'not_run' || value === 'succeeded' || value === 'failed') return value
  throw new Error('discovery_repair_result_invalid')
}
type LegacyUnavailableServices = LegacyUnavailableDiscoveryManifest['services']
type LegacyUnavailableService = LegacyUnavailableServices[number]
type LegacyUnavailableCapability = LegacyUnavailableService['capabilities'][number]

function readLegacyCapabilityKind(value: unknown): LegacyUnavailableCapability['kind'] {
  if (
    value === 'phone_inquiry'
    || value === 'quote_request'
    || value === 'emergency_callout_interest'
    || value === 'ae_hosted_discovery'
  ) return value
  throw new Error('discovery_legacy_manifest_invalid')
}

function readLegacyCapabilityStatus(value: unknown): LegacyUnavailableCapability['status'] {
  if (value === 'available' || value === 'degraded' || value === 'unavailable' || value === 'stale') return value
  throw new Error('discovery_legacy_manifest_invalid')
}

function readLegacyFirstRequestMode(value: unknown): LegacyUnavailableCapability['firstRequest']['mode'] {
  if (value === 'inquiry_available' || value === 'quote_request_available' || value === 'not_available_yet') return value
  throw new Error('discovery_legacy_manifest_invalid')
}

function readLegacyPublicChannel(value: unknown): LegacyUnavailableCapability['firstRequest']['publicChannel'] {
  if (value === 'public_business_contact' || value === 'ae_status_only' || value === 'not_available') return value
  throw new Error('discovery_legacy_manifest_invalid')
}

function readLegacyServiceStatus(value: unknown): LegacyUnavailableService['status'] {
  if (value === 'published') return value
  throw new Error('discovery_legacy_manifest_invalid')
}

function readLegacyManifestServices(value: unknown): LegacyUnavailableServices {
  return requiredArray(value, 'discovery_legacy_manifest').map((serviceValue): LegacyUnavailableService => {
    const service = requiredRecord(serviceValue, 'discovery_legacy_manifest')
    const capabilities = requiredArray(service.capabilities, 'discovery_legacy_manifest')
      .map((capabilityValue): LegacyUnavailableCapability => {
        const capability = requiredRecord(capabilityValue, 'discovery_legacy_manifest')
        const firstRequest = requiredRecord(capability.firstRequest, 'discovery_legacy_manifest')
        const reason = optionalString(capability.reason, 'discovery_legacy_manifest')
        const noContactReason = optionalString(firstRequest.noContactReason, 'discovery_legacy_manifest')
        if (capability.callable !== false || capability.paymentRequired !== false) {
          throw new Error('discovery_legacy_manifest_invalid')
        }
        return {
          kind: readLegacyCapabilityKind(capability.kind),
          status: readLegacyCapabilityStatus(capability.status),
          firstRequest: {
            mode: readLegacyFirstRequestMode(firstRequest.mode),
            publicDisclosure: requiredString(firstRequest.publicDisclosure, 'discovery_legacy_manifest'),
            publicChannel: readLegacyPublicChannel(firstRequest.publicChannel),
            ...(noContactReason === undefined ? {} : { noContactReason }),
          },
          callable: false,
          paymentRequired: false,
          ...(reason === undefined ? {} : { reason }),
        }
      })
    return {
      slug: brandNonEmpty(requiredString(service.slug, 'discovery_legacy_manifest'), 'ServiceSlug'),
      name: brandNonEmpty(requiredString(service.name, 'discovery_legacy_manifest'), 'ServiceName'),
      category: brandNonEmpty(requiredString(service.category, 'discovery_legacy_manifest'), 'ServiceCategory'),
      summary: brandNonEmpty(requiredString(service.summary, 'discovery_legacy_manifest'), 'ServiceSummary'),
      serviceArea: brandNonEmpty(requiredString(service.serviceArea, 'discovery_legacy_manifest'), 'ServiceArea'),
      hoursOrUnknown: brandNonEmpty(requiredString(service.hoursOrUnknown, 'discovery_legacy_manifest'), 'ServiceHours'),
      status: readLegacyServiceStatus(service.status),
      capabilities,
    }
  })
}

function manifestFromDoc(document: Doc<'discoveryManifests'>): DiscoveryManifestRead | undefined {
  if ('services' in document) {
    const schemaVersion = brandNonEmpty(document.schemaVersion, 'SchemaVersion')
    const slug = brandNonEmpty(document.slug, 'Slug')
    const businessName = brandNonEmpty(document.businessName, 'BusinessName')
    const category = brandNonEmpty(document.category, 'Category')
    const suburb = brandNonEmpty(document.suburb, 'Suburb')
    const stateTerritory = brandNonEmpty(document.stateTerritory, 'StateTerritory')
    const sourceHash = brandNonEmpty(document.sourceHash, 'SourceHash')
    const generatedHash = brandNonEmpty(document.generatedHash, 'GeneratedHash')
    const bodyHash = brandNonEmpty(document.bodyHash, 'BodyHash')
    const urlHash = brandNonEmpty(document.urlHash, 'UrlHash')
    if (document.publicUrl !== `/${slug}` || document.manifestUrl !== `/${slug}/.well-known/ucp`) {
      throw new Error('discovery_legacy_manifest_url_invalid')
    }
    return {
      kind: 'legacy_unavailable',
      reason: 'offering_identity_unavailable',
      schemaVersion,
      businessId: String(document.businessId),
      slug,
      businessName,
      category,
      location: {
        suburb,
        stateTerritory,
        ...(document.postcode === undefined ? {} : { postcode: document.postcode }),
      },
      publicUrl: document.publicUrl,
      manifestUrl: document.manifestUrl,
      ucpVersion: document.ucpVersion,
      pathKind: document.pathKind,
      status: document.status,
      sourceHash,
      sourceVersion: document.sourceVersion,
      generatedHash,
      bodyHash,
      urlHash,
      generatedAt: document.generatedAt,
      updatedAt: document.updatedAt,
      ...(document.degradedReason === undefined ? {} : { degradedReason: document.degradedReason }),
      ...(document.suppressedAt === undefined ? {} : { suppressedAt: document.suppressedAt }),
      routes: document.routes.map(readManifestRoute),
      services: readLegacyManifestServices(document.services),
      unsupportedCapabilities: {
        callable: false,
        paymentRequired: false,
      },
    }
  }
  const schemaVersion = readCurrentManifestSchemaVersion(document.schemaVersion)
  const businessCatalogSchemaVersion = document.businessCatalogSchemaVersion === undefined
    ? undefined
    : readCatalogSchemaVersion(document.businessCatalogSchemaVersion)
  const pathKind = readCurrentManifestPathKind(document.pathKind)
  const sourceVersion = readCurrentManifestSourceVersion(document.sourceVersion)
  if (
    schemaVersion === undefined
    || businessCatalogSchemaVersion === undefined
    || pathKind === undefined
    || sourceVersion === undefined
    || document.disposition === undefined
    || document.observedAt === undefined
    || document.offerings === undefined
  ) return undefined
  return {
    schemaVersion,
    businessCatalogSchemaVersion,
    businessId: brandNonEmpty(document.businessId, 'BusinessId'),
    slug: brandNonEmpty(document.slug, 'Slug'),
    businessName: document.businessName,
    category: document.category,
    businessContext: document.businessContext,
    publicUrl: document.publicUrl,
    manifestUrl: document.manifestUrl,
    ucpVersion: document.ucpVersion,
    pathKind,
    disposition: readManifestDisposition(document.disposition),
    ...(document.sourceHash === undefined ? {} : { sourceHash: brandNonEmpty(document.sourceHash, 'SourceHash') }),
    sourceVersion,
    generatedHash: brandNonEmpty(document.generatedHash, 'SourceHash'),
    bodyHash: brandNonEmpty(document.bodyHash, 'SourceHash'),
    urlHash: brandNonEmpty(document.urlHash, 'SourceHash'),
    generatedAt: document.generatedAt,
    observedAt: document.observedAt,
    routes: document.routes.map(readManifestRoute),
    offerings: document.offerings.map(readManifestOffering),
    ...(document.degradedReason === undefined ? {} : { degradedReason: document.degradedReason }),
    ...(document.suppressedAt === undefined ? {} : { suppressedAt: document.suppressedAt }),
  }
}


function attemptFromDoc(
  document: Doc<'discoveryManifestAttempts'>,
  expectedBusinessId?: Id<'businesses'>,
  expectedSlug?: string,
  expectedSourceHash?: string,
): DiscoveryAttempt {
  const readback = document.latestReadback
  const businessId = expectedBusinessId ?? document.businessId
  const sourceHash = expectedSourceHash ?? document.sourceHash
  const slug = expectedSlug ?? readback?.slug
  let readbackRoutes: readonly [string, string, string] | undefined
  if (readback !== undefined && slug !== undefined) {
    try {
      const parsed = new URL(readback.manifestUrl)
      const manifestPathSuffix = `/${slug}/ucp`
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:')
        && parsed.username === ''
        && parsed.password === ''
        && parsed.search === ''
        && parsed.hash === ''
        && parsed.pathname.endsWith(manifestPathSuffix)
      ) {
        const canonicalBasePath = parsed.pathname.slice(0, -manifestPathSuffix.length)
        const canonicalBaseUrl = `${parsed.origin}${canonicalBasePath}`
        readbackRoutes = [
          `${canonicalBaseUrl}/${slug}`,
          readback.manifestUrl,
          `${canonicalBaseUrl}/api/businesses/${slug}`,
        ]
      }
    } catch {
      readbackRoutes = undefined
    }
  }
  if (
    document.businessId !== businessId
    || document.sourceVersion !== 'public-catalog:v1'
    || document.pathKind !== 'ae_hosted_fallback'
    || document.attemptId !== `discovery:manifest:${businessId}:${document.sourceHash}:v1`
    || document.sourceHash !== sourceHash
    || (document.status === 'succeeded' && (
      readback === undefined
      || document.finishedAt === undefined
      || document.generatedHash === undefined
      || document.bodyHash === undefined
      || document.urlHash === undefined
    ))
  ) {
    throw new Error('discovery_attempt_identity_invalid')
  }
  if (readback !== undefined) {
    if (slug === undefined || readbackRoutes === undefined) throw new Error('discovery_attempt_readback_invalid')
    if (
      readback.businessId !== businessId
      || readback.slug !== slug
      || readback.sourceVersion !== 'public-catalog:v1'
      || readback.sourceHash !== sourceHash
      || readback.routeUrls.length !== readbackRoutes.length
      || readbackRoutes.some((route) => !readback.routeUrls.includes(route))
      || (document.generatedHash !== undefined && document.generatedHash !== readback.generatedHash)
      || (document.bodyHash !== undefined && document.bodyHash !== readback.bodyHash)
      || (document.urlHash !== undefined && document.urlHash !== readback.urlHash)
    ) {
      throw new Error('discovery_attempt_readback_invalid')
    }
  }
  const latestReadback = readbackField(readback)
  return {
    attemptId: document.attemptId,
    businessId: document.businessId,
    ucpVersion: document.ucpVersion,
    pathKind: 'ae_hosted_fallback',
    sourceHash: document.sourceHash,
    sourceVersion: 'public-catalog:v1',
    status: readAttemptStatus(document.status),
    retryCount: document.retryCount,
    ...(document.failureCode === undefined ? {} : { failureCode: document.failureCode }),
    ...(document.failureMessageRedacted === undefined ? {} : { failureMessageRedacted: document.failureMessageRedacted }),
    startedAt: document.startedAt,
    ...(document.finishedAt === undefined ? {} : { finishedAt: document.finishedAt }),
    ...(document.generatedHash === undefined ? {} : { generatedHash: document.generatedHash }),
    ...(document.bodyHash === undefined ? {} : { bodyHash: document.bodyHash }),
    ...(document.urlHash === undefined ? {} : { urlHash: document.urlHash }),
    ...(latestReadback === undefined ? {} : { latestReadback }),
    ...(document.staleThresholdAt === undefined ? {} : { staleThresholdAt: document.staleThresholdAt }),
    repairAction: readRepairAction(document.repairAction),
    repairResult: readRepairResult(document.repairResult),
  }
}

function auditFromDoc(document: Doc<'auditEvents'>): DiscoveryAuditEvent {
  if (document.businessId === undefined) throw new Error('discovery_audit_business_missing')
  return {
    eventId: document.eventId,
    eventType: document.eventType,
    actorKind: document.actorKind,
    actorRef: document.actorRef,
    businessId: document.businessId,
    targetType: document.targetType,
    targetRef: document.targetRef,
    beforeState: document.beforeState ?? '',
    afterState: document.afterState ?? '',
    idempotencyKey: document.idempotencyKey,
    correlationId: document.correlationId,
    evidenceRefs: document.evidenceRefs,
    redactedPayloadJson: document.redactedPayloadJson,
    payloadHash: document.payloadHash,
    createdAt: document.createdAt,
  }
}

function readbackForManifest(
  manifest: DiscoveryManifest,
  businessId: Id<'businesses'>,
  sourceHash: string,
  readAt: number,
): DiscoveryReadback {
  return {
    businessId: brandNonEmpty(businessId, 'BusinessId'),
    slug: manifest.slug,
    manifestUrl: manifest.manifestUrl,
    sourceVersion: 'public-catalog:v1',
    sourceHash: brandNonEmpty(sourceHash, 'SourceHash'),
    generatedHash: manifest.generatedHash,
    bodyHash: manifest.bodyHash,
    urlHash: manifest.urlHash,
    routeUrls: manifest.routes.map((route) => route.url),
    readAt,
  }
}

function readbackField(readback: Doc<'discoveryManifestAttempts'>['latestReadback']): DiscoveryReadback | undefined {
  if (readback === undefined) return undefined
  return {
    businessId: brandNonEmpty(readback.businessId, 'BusinessId'),
    slug: brandNonEmpty(readback.slug, 'Slug'),
    manifestUrl: readback.manifestUrl,
    sourceVersion: 'public-catalog:v1',
    sourceHash: brandNonEmpty(readback.sourceHash, 'SourceHash'),
    generatedHash: brandNonEmpty(readback.generatedHash, 'SourceHash'),
    bodyHash: brandNonEmpty(readback.bodyHash, 'SourceHash'),
    urlHash: brandNonEmpty(readback.urlHash, 'SourceHash'),
    routeUrls: readback.routeUrls,
    readAt: readback.readAt,
  }
}

function readEnv(name: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[name]
}

function canonicalBaseUrl(value: string | undefined): string {
  const raw = value ?? readEnv('AE_CANONICAL_BASE_URL') ?? readEnv('SITE_URL') ?? 'https://ae.example'
  return trimTrailingSlashes(raw)
}

export type {
  DiscoveryHealthReadback,
  DiscoveryManifestAttemptContract,
  DiscoveryManifestContract,
  DiscoveryPathKind,
  DiscoverySourceState,
  DiscoveryStatus,
  InvalidateDiscoveryManifestResult,
  RegenerateDiscoveryManifestResult,
} from '../src/modules/discovery/public'
