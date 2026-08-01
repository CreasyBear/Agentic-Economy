import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  catalogFromRows,
  projectDiscoveryPublicCatalog,
} from '../src/modules/catalog/public'
import type { BusinessSupplyProjection } from '../src/modules/catalog/public'
import {
  projectBusinessSupplyToPublicApi,
} from '../src/modules/registry/public'
import type { PublicBusinessCatalogApiV2Dto } from '../src/modules/registry/public'
import { buildOfferingLlmsTxt } from '../src/modules/discovery/internal/discovery-files'
import { resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import { runtimeMutationCtx, runtimeReader } from './source_state'
import type { RuntimeDocument, RuntimeMutationCtx, RuntimeReader, RuntimeWriter } from './source_state'
import {
  isRecord,
  numberField,
  optionalNumberField,
  optionalStringField,
  stringField,
} from './inquiryRuntimeDbHelpers'
import { stableHash } from '../src/modules/common/stable-hash'
import type { BusinessMutationActor } from '../src/modules/business/public'
import { CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES } from '../src/modules/customer-request/public-comprehension'
import {
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
  CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
  CUSTOMER_REQUEST_STATE_VALUES,
} from '../src/modules/customer-request/agent-contract'

const routeResult = v.object({
  kind: v.union(v.literal('business_page'), v.literal('ucp_manifest'), v.literal('api_detail')),
  url: v.string(),
  routeTested: v.literal(true),
})

const firstRequestResult = v.object({
  mode: v.union(v.literal('inquiry_available'), v.literal('quote_request_available'), v.literal('not_available_yet')),
  publicDisclosure: v.string(),
  publicChannel: v.union(v.literal('public_business_contact'), v.literal('ae_status_only'), v.literal('not_available')),
  noContactReason: v.optional(v.string()),
})

const manifestCapabilityResult = v.object({
  kind: v.union(
    v.literal('phone_inquiry'),
    v.literal('quote_request'),
    v.literal('booking_interest'),
    v.literal('emergency_callout_interest'),
    v.literal('ae_hosted_discovery')
  ),
  status: v.union(v.literal('unavailable'), v.literal('degraded'), v.literal('available'), v.literal('stale')),
  firstRequest: firstRequestResult,
  callable: v.literal(false),
  paymentRequired: v.literal(false),
  reason: v.optional(v.string()),
})

const manifestServiceResult = v.object({
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceArea: v.string(),
  hoursOrUnknown: v.string(),
  status: v.literal('published'),
  capabilities: v.array(manifestCapabilityResult),
})

const manifestResult = v.object({
  schemaVersion: v.literal('ae-ucp-fallback:v1'),
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
  pathKind: v.literal('ae_hosted_fallback'),
  status: v.union(v.literal('unavailable'), v.literal('degraded'), v.literal('available'), v.literal('stale')),
  sourceHash: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  generatedHash: v.string(),
  bodyHash: v.string(),
  urlHash: v.string(),
  generatedAt: v.number(),
  updatedAt: v.number(),
  routes: v.array(routeResult),
  services: v.array(manifestServiceResult),
  unsupportedCapabilities: v.object({
    callable: v.literal(false),
    paymentRequired: v.literal(false),
  }),
  degradedReason: v.optional(v.string()),
  suppressedAt: v.optional(v.number()),
})

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

const discoveryMutationAuthArgs = {
  csrfToken: v.optional(v.string()),
  csrfCookie: v.optional(v.string()),
  origin: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
}
export const regenerateDiscoveryManifest = mutationGeneric({
  args: {
    businessId: v.optional(v.string()),
    slug: v.optional(v.string()),
    canonicalBaseUrl: v.optional(v.string()),
    ...discoveryMutationAuthArgs,
    ...sourceWriteArgs,
  },
  returns: regenerateResult,
  handler: async (ctx, args) => {
    const runtimeCtx = runtimeMutationCtx(ctx)
    const db = runtimeCtx.db
    const auth = await requireOwnerMutation(runtimeCtx, args)
    if (auth.kind === 'error') {
      return auth.error
    }

    const catalog = await publicCatalogForBusiness(db, auth.business)
    if (catalog === undefined) {
      return discoveryError('discovery_manifest_not_public', 'Catalog is not public or has no published services.')
    }

    const now = Date.now()
    const manifest = buildManifest(catalog, canonicalBaseUrl(args.canonicalBaseUrl), now, 'available')
    const existingAttempt = await latestAttemptForBusiness(db, catalog.businessId)
    const replayed = existingAttempt?.status === 'succeeded' && existingAttempt.generatedHash === manifest.generatedHash
    const [, attempt, auditEvent] = await Promise.all([
      upsertManifest(db, manifest),
      upsertSucceededAttempt(db, manifest, existingAttempt, now),
      ensureDiscoveryAuditEvent(db, manifest, now),
    ])
    return {
      kind: 'ok' as const,
      code: replayed ? 'discovery_manifest_replayed' as const : 'discovery_manifest_generated' as const,
      manifest,
      attempt,
      auditEvent,
    }
  },
})

/** System-callable (no owner gate) discovery-manifest generation for dev seeding. */
export async function seedDiscoveryManifestForBusinessCommand(
  db: RuntimeMutationCtx['db'],
  business: RuntimeDocument,
  now: number,
): Promise<'generated' | 'skipped'> {
  const catalog = await publicCatalogForBusiness(db, business)
  if (catalog === undefined) return 'skipped'
  const manifest = buildManifest(catalog, canonicalBaseUrl(undefined), now, 'available')
  const existingAttempt = await latestAttemptForBusiness(db, catalog.businessId)
  await upsertManifest(db, manifest)
  await upsertSucceededAttempt(db, manifest, existingAttempt, now)
  await ensureDiscoveryAuditEvent(db, manifest, now)
  return 'generated'
}

export const invalidateDiscoveryManifest = mutationGeneric({
  args: {
    businessId: v.string(),
    reasonCode: v.string(),
    ...discoveryMutationAuthArgs,
    ...sourceWriteArgs,
  },
  returns: invalidateResult,
  handler: async (ctx, args) => {
    const runtimeCtx = runtimeMutationCtx(ctx)
    const db = runtimeCtx.db
    const auth = await requireOwnerMutation(runtimeCtx, args)
    if (auth.kind === 'error') {
      return auth.error
    }

    const now = Date.now()
    const manifestDocs = await db
      .query('discoveryManifests')
      .withIndex('by_business_version', (query) => query.eq('businessId', args.businessId))
      .collect()
    const manifests: DiscoveryManifest[] = []
    for (const manifestDoc of manifestDocs) {
      await db.patch(manifestDoc._id, {
        status: 'stale',
        degradedReason: args.reasonCode,
        suppressedAt: now,
        updatedAt: now,
      })
      manifests.push(manifestFromDoc({ ...manifestDoc, status: 'stale', degradedReason: args.reasonCode, suppressedAt: now, updatedAt: now }))
    }

    const attemptDocs = await db
      .query('discoveryManifestAttempts')
      .withIndex('by_business_status', (query) => query.eq('businessId', args.businessId))
      .collect()
    const attempts: DiscoveryAttempt[] = []
    for (const attemptDoc of attemptDocs) {
      const next = {
        ...attemptFromDoc(attemptDoc),
        status: 'stale' as const,
        finishedAt: now,
        staleThresholdAt: now,
        failureCode: args.reasonCode,
        repairAction: 'invalidate_manifest' as const,
        repairResult: 'succeeded' as const,
      }
      await db.patch(attemptDoc._id, attemptPatch(next))
      attempts.push(next)
    }

    return {
      kind: 'ok' as const,
      code: 'discovery_manifest_invalidated' as const,
      attempts,
      manifests,
    }
  },
})

export const readDiscoveryHealth = queryGeneric({
  args: {
    businessId: v.string(),
  },
  returns: healthResult,
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    return readDiscoveryHealthFromDb(db, args.businessId)
  },
})

export const readCatalogDiscoveryManifest = queryGeneric({
  args: {
    slug: v.string(),
    canonicalBaseUrl: v.optional(v.string()),
    now: v.number(),
  },
  returns: manifestReadResult,
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    const business = await findBusiness(db, { slug: args.slug })
    if (business === null) {
      return { kind: 'hidden' as const, reason: 'no_public_catalog' as const }
    }

    const catalog = await publicCatalogForBusiness(db, business)
    if (catalog === undefined) {
      return { kind: 'hidden' as const, reason: 'not_public' as const }
    }

    const latestAttempt = await latestAttemptForBusiness(db, catalog.businessId)
    const discoveryStatus = healthStatus(true, latestAttempt, catalog.sourceHash)
    return {
      kind: 'available' as const,
      manifest: buildManifest(
        { ...catalog, discoveryStatus },
        canonicalBaseUrl(args.canonicalBaseUrl),
        args.now,
        discoveryStatus
      ),
    }
  },
})

export const readLlmsTxt = queryGeneric({
  args: {
    canonicalBaseUrl: v.optional(v.string()),
    routingBaseUrl: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  returns: discoveryFileResult,
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    const result = buildOfferingLlmsTxt(await publicOfferingSupplyForDiscovery(db), {
      canonicalBaseUrl: canonicalBaseUrl(args.canonicalBaseUrl),
      routingBaseUrl: canonicalBaseUrl(args.routingBaseUrl),
    })
    return { body: result.body, urls: [...result.urls] }
  },
})

export const readSitemapXml = queryGeneric({
  args: {
    canonicalBaseUrl: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  returns: discoveryFileResult,
  handler: async (ctx, args) => {
    const db = runtimeReader(ctx.db)
    return buildSitemapXmlFromCatalogs(await publicCatalogsForDiscovery(db), {
      canonicalBaseUrl: canonicalBaseUrl(args.canonicalBaseUrl),
      now: args.now ?? Date.now(),
    })
  },
})

type OwnerMutationArgs = {
  businessId?: string
  slug?: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  sourceWrite?: SourceWriteArgs['sourceWrite']
  operationKey?: string
  correlationId?: string
}

type OwnerMutationAuth =
  | { kind: 'ok'; actor: Extract<BusinessMutationActor, { kind: 'authenticated_owner' }>; business: RuntimeDocument }
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

type PublicCatalog = {
  businessId: string
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  postcode?: string
  publicStatus: 'published'
  trustTier: CatalogTrustTier
  indexStatus: 'not_queued' | 'queued' | 'indexed' | 'failed' | 'stale'
  discoveryStatus: 'unavailable' | 'degraded' | 'available' | 'stale'
  services: PublicService[]
  sourceHash: string
  updatedAt: number
}

type PublicService = {
  serviceId: string
  serviceSlug: string
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  firstRequest: FirstRequest
  capabilities: PublicCapability[]
  sourceHash: string
}

type FirstRequest = {
  mode: 'inquiry_available' | 'quote_request_available' | 'not_available_yet'
  publicDisclosure: string
  publicChannel: 'public_business_contact' | 'ae_status_only' | 'not_available'
  noContactReason?: string
}

type PublicCapability = {
  kind: CatalogCapabilityKind
  status: CatalogDiscoveryStatus
  firstRequest: FirstRequest
  callable: false
  paymentRequired: false
  reason?: string
}

type CatalogTrustTier = 'claimed' | 'contact_confirmed' | 'listed' | 'registry_verified'
type CatalogCapabilityKind = 'phone_inquiry' | 'quote_request' | 'booking_interest' | 'emergency_callout_interest' | 'ae_hosted_discovery'
type CatalogDiscoveryStatus = 'unavailable' | 'degraded' | 'available' | 'stale'

type DiscoveryManifest = {
  schemaVersion: 'ae-ucp-fallback:v1'
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
  pathKind: 'ae_hosted_fallback'
  status: 'unavailable' | 'degraded' | 'available' | 'stale'
  sourceHash: string
  sourceVersion: 'public-catalog:v1'
  generatedHash: string
  bodyHash: string
  urlHash: string
  generatedAt: number
  updatedAt: number
  routes: { kind: 'business_page' | 'ucp_manifest' | 'api_detail'; url: string; routeTested: true }[]
  services: ManifestService[]
  unsupportedCapabilities: { callable: false; paymentRequired: false }
  degradedReason?: string
  suppressedAt?: number
}

type ManifestService = {
  slug: string
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  status: 'published'
  capabilities: ManifestCapability[]
}

type ManifestCapability = {
  kind: CatalogCapabilityKind
  status: CatalogDiscoveryStatus
  firstRequest: FirstRequest
  callable: false
  paymentRequired: false
  reason?: string
}

type DiscoveryReadback = {
  businessId: string
  slug: string
  manifestUrl: string
  sourceVersion: 'public-catalog:v1'
  sourceHash: string
  generatedHash: string
  bodyHash: string
  urlHash: string
  routeUrls: string[]
  readAt: number
}

type DiscoveryAttempt = {
  attemptId: string
  businessId: string
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
  businessId: string
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

async function requireOwnerMutation(ctx: RuntimeMutationCtx, args: OwnerMutationArgs): Promise<OwnerMutationAuth> {
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

  const owner = await ctx.db.get(stringField(business, 'ownerId'))
  if (owner === null || stringField(owner, 'clerkUserId') !== actor.clerkUserId) {
    return { kind: 'error', error: discoveryError('discovery_manifest_wrong_owner', 'Only the source-bound owner can mutate discovery state.') }
  }

  return { kind: 'ok', actor, business }
}

async function findBusiness(db: RuntimeReader, args: OwnerMutationArgs): Promise<RuntimeDocument | null> {
  if (args.businessId !== undefined) {
    return db.get(args.businessId)
  }
  if (args.slug === undefined) {
    return null
  }
  return db
    .query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', normalizeSlug(args.slug ?? '')))
    .unique()
}

function discoveryError(
  code: DiscoveryMutationError['code'],
  reason: string,
  retryable = false
): DiscoveryMutationError {
  return { kind: 'error', code, retryable, reason }
}

async function publicCatalogForBusiness(db: RuntimeReader, business: RuntimeDocument): Promise<PublicCatalog | undefined> {
  if (stringField(business, 'publicStatus') !== 'published') {
    return undefined
  }
  if (await hasActiveBusinessSuppression(db, business._id)) {
    return undefined
  }
  const context = await db
    .query('businessContexts')
    .withIndex('by_business', (query) => query.eq('businessId', business._id))
    .unique()
  if (context === null) {
    return undefined
  }
  const services = await db
    .query('businessServices')
    .withIndex('by_business_status', (query) => query.eq('businessId', business._id).eq('status', 'published'))
    .collect()
  if (services.length === 0) {
    return undefined
  }
  const [capabilities, indexStatus, discoveryStatus] = await Promise.all([
    db
      .query('serviceCapabilities')
      .withIndex('by_business_service_status', (query) => query.eq('businessId', business._id))
      .collect(),
    indexStatusForBusiness(db, business._id),
    discoveryStatusForBusiness(db, business._id, stringField(business, 'sourceHash')),
  ])
  const catalog = catalogFromRows({
    businessId: business._id,
    slug: stringField(business, 'slug'),
    name: stringField(business, 'name'),
    category: stringField(context, 'category'),
    suburb: stringField(context, 'suburb'),
    stateTerritory: stringField(context, 'stateTerritory'),
    sourceHash: stringField(business, 'sourceHash'),
    updatedAt: numberField(business, 'updatedAt'),
    trustTier: trustTier(business),
    indexStatus,
    discoveryStatus,
    ...(optionalStringField(context, 'postcode') === undefined ? {} : { postcode: stringField(context, 'postcode') }),
    services: services
      .map((service) => ({
        serviceId: service._id,
        serviceSlug: stringField(service, 'serviceSlug'),
        name: stringField(service, 'name'),
        category: stringField(service, 'category'),
        summary: stringField(service, 'summary'),
        serviceArea: stringField(service, 'serviceArea'),
        hoursOrUnknown: stringField(service, 'hoursOrUnknown'),
        sortOrder: numberField(service, 'sortOrder'),
        sourceHash: stringField(service, 'sourceHash'),
        status: 'published' as const,
      })),
    capabilities: capabilities.map((capability) => ({
      serviceId: stringField(capability, 'serviceId'),
      kind: capabilityKind(capability),
      status: capabilityStatus(capability),
      firstRequest: toFirstRequest(capability),
      ...(optionalStringField(capability, 'reason') === undefined
        ? {}
        : { reason: stringField(capability, 'reason') }),
      sourceHash: stringField(capability, 'sourceHash'),
    })),
  })
  return catalog === undefined ? undefined : projectDiscoveryPublicCatalog(catalog) as PublicCatalog
}

async function publicCatalogsForDiscovery(db: RuntimeReader): Promise<PublicCatalog[]> {
  const businesses = await db
    .query('businesses')
    .withIndex('by_publicStatus_slug', (query) => query.eq('publicStatus', 'published'))
    .collect()
  const catalogResults = await Promise.all(businesses.map((business) => publicCatalogForBusiness(db, business)))
  const catalogs: PublicCatalog[] = []
  for (const catalog of catalogResults) {
    if (catalog !== undefined) {
      catalogs.push(catalog)
    }
  }
  return catalogs.sort((left, right) => left.slug.localeCompare(right.slug))
}

async function publicOfferingSupplyForDiscovery(
  db: RuntimeReader,
): Promise<PublicBusinessCatalogApiV2Dto[]> {
  const businesses = await db.query('businesses')
    .withIndex('by_publicStatus_slug', (query) => query.eq('publicStatus', 'published'))
    .collect()
  const results = await Promise.all(businesses.map(async (business) => {
    if (await hasActiveBusinessSuppression(db, business._id)) return undefined
    const cutover = await db.query('catalogSupplyCutovers')
      .withIndex('by_businessId', (query) => query.eq('businessId', business._id))
      .unique()
    const mode = cutover === null ? 'legacy' : stringField(cutover, 'mode')
    if (mode === 'legacy' || mode === 'compare') {
      // Until persisted Offering truth is authoritative, publish profile routes
      // without reproducing legacy service detail in the assistant index.
      return {
        schemaVersion: 'public-business-catalog-api:v2' as const,
        businessId: business._id,
        slug: stringField(business, 'slug'),
        name: stringField(business, 'name'),
        category: stringField(business, 'category'),
        suburb: stringField(business, 'suburb'),
        stateTerritory: stringField(business, 'stateTerritory'),
        ...(optionalStringField(business, 'publishedPhone') === undefined ? {} : { publishedPhone: stringField(business, 'publishedPhone') }),
        publicUrl: `/${stringField(business, 'slug')}`,
        observedAt: numberField(business, 'updatedAt'),
        disposition: 'partial' as const,
        offerings: [],
        accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
      }
    }
    if (mode !== 'offering') return undefined

    const snapshot = await db.query('businessSupplyProjectionSnapshots')
      .withIndex('by_businessId', (query) => query.eq('businessId', business._id))
      .unique()
    if (snapshot === null) return undefined
    try {
      const projection = JSON.parse(stringField(snapshot, 'projectionJson')) as BusinessSupplyProjection
      if (
        projection === null
        || typeof projection !== 'object'
        || projection.business?.businessId !== business._id
        || projection.business?.slug !== stringField(business, 'slug')
        || !Array.isArray(projection.offerings)
      ) return undefined
      const projected = projectBusinessSupplyToPublicApi(projection, Date.now())
      return stringField(snapshot, 'status') === 'projection_pending'
        ? { ...projected, disposition: 'stale' as const }
        : projected
    } catch {
      return undefined
    }
  }))
  return results
    .filter((result): result is PublicBusinessCatalogApiV2Dto => result !== undefined)
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

async function discoveryStatusForBusiness(
  db: RuntimeReader,
  businessId: string,
  sourceHash: string
): Promise<PublicCatalog['discoveryStatus']> {
  return healthStatus(true, await latestAttemptForBusiness(db, businessId), sourceHash)
}

async function hasActiveBusinessSuppression(db: RuntimeReader, businessId: string): Promise<boolean> {
  const suppression = await db
    .query('suppressionRules')
    .withIndex('by_target_status', (query) =>
      query.eq('targetType', 'business').eq('targetRef', businessId).eq('status', 'active')
    )
    .unique()
  return suppression !== null
}

function toPublicService(service: RuntimeDocument, capabilities: readonly RuntimeDocument[]): PublicService {
  const serviceCapabilities = capabilities.filter((capability) => stringField(capability, 'serviceId') === service._id)
  const firstCapability = serviceCapabilities.at(0)
  return {
    serviceId: service._id,
    serviceSlug: stringField(service, 'serviceSlug'),
    name: stringField(service, 'name'),
    category: stringField(service, 'category'),
    summary: stringField(service, 'summary'),
    serviceArea: stringField(service, 'serviceArea'),
    hoursOrUnknown: stringField(service, 'hoursOrUnknown'),
    firstRequest: firstCapability === undefined ? unavailableFirstRequest() : toFirstRequest(firstCapability),
    capabilities: serviceCapabilities.map(toPublicCapability),
    sourceHash: stringField(service, 'sourceHash'),
  }
}

function toPublicCapability(capability: RuntimeDocument): PublicCapability {
  return {
    kind: capabilityKind(capability),
    status: capabilityStatus(capability),
    firstRequest: toFirstRequest(capability),
    callable: false,
    paymentRequired: false,
    ...(optionalStringField(capability, 'reason') === undefined ? {} : { reason: stringField(capability, 'reason') }),
  }
}

function toFirstRequest(capability: RuntimeDocument): FirstRequest {
  return {
    mode: firstRequestMode(capability),
    publicDisclosure: stringField(capability, 'publicDisclosure'),
    publicChannel: publicChannel(capability),
    ...(optionalStringField(capability, 'noContactReason') === undefined ? {} : { noContactReason: stringField(capability, 'noContactReason') }),
  }
}

function unavailableFirstRequest(): FirstRequest {
  return {
    mode: 'not_available_yet',
    publicDisclosure: 'First request is not available yet.',
    publicChannel: 'not_available',
    noContactReason: 'Owner has not supplied public contact instructions.',
  }
}

const staticSitemapPaths = ['/', '/claim', '/registry', '/for-agents', '/privacy/remove-business'] as const
const publicSurfacePaths = [
  '/',
  '/claim',
  '/registry',
  '/for-agents',
  '/privacy/remove-business',
  '/api/businesses',
  '/api/businesses/search?q=',
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path,
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath,
] as const

function buildLlmsTxtFromCatalogs(
  catalogs: readonly PublicCatalog[],
  options: { canonicalBaseUrl: string; routingBaseUrl: string }
): { body: string; urls: string[] } {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl)
  const urls = [
    ...publicSurfacePaths.map((path) => `${canonicalBaseUrl}${path}`),
    ...catalogs.flatMap((catalog) => [
      `${canonicalBaseUrl}/${catalog.slug}`,
      `${canonicalBaseUrl}/${catalog.slug}/ucp`,
      `${canonicalBaseUrl}/api/businesses/${catalog.slug}`,
    ]),
  ]
  const catalogLines = catalogs.map(
    (catalog) =>
      `- slug=${catalog.slug} publicUrl=${canonicalBaseUrl}/${catalog.slug} ucpUrl=${canonicalBaseUrl}/${catalog.slug}/ucp apiUrl=${canonicalBaseUrl}/api/businesses/${catalog.slug} publicStatus=${catalog.publicStatus} indexStatus=${catalog.indexStatus} discoveryStatus=${catalog.discoveryStatus}`
  )
  const body = [
    '# Agentic Economy',
    '',
    'Customer journey:',
    ...CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES.map((line) => `- ${line}`),
    `- Human entry=${canonicalBaseUrl}/`,
    '',
    'Public surfaces:',
    ...publicSurfacePaths.map((path) => `- ${canonicalBaseUrl}${path}`),
    '',
    'Assistant setup:',
    `- ${canonicalBaseUrl}/SKILL.md`,
    '',
    'Customer Request API:',
    `- schema=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath}`,
    `- submit=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path}`,
    '- continue=follow exactly one matching navigation.actions relation from the latest response',
    `- relations=${CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES.join(' | ')}`,
    '- auth=Bearer AE API key with customer_requests:create',
    `- lifecycle=${CUSTOMER_REQUEST_STATE_VALUES.join(' | ')}`,
    '',
    'Request recipe:',
    `1. Read ${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath}, then POST a natural-language request to ${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path} with one opaque requestRef.`,
    '2. Continue only through the method, href, and input template advertised by one matching navigation.actions relation.',
    '3. Never construct a later path, sequence, business, step, limit, recipient, purpose, effect, or authority field.',
    '4. Stop if a needed relation is missing, duplicated, changes origin, crosses into another Request, or asks for authority AE did not display.',
    '5. Show routes_ready options without inferring a choice. If the customer changes what matters, follow change_request and review the new revision before confirmation.',
    '6. Follow confirm_option only after explicit approval; confirmation does not start work.',
    '7. Resume the same Request using advertised relations. Never create a replacement or retry an outcome_unknown effect.',
    '',
    'Catalog entries:',
    ...(catalogLines.length === 0 ? ['- none'] : catalogLines),
    '',
    'Listing boundary:',
    '- Listing endpoints publish business facts; they do not select or execute routes. A Customer Request is the only public path that can compare, confirm, and start a registered option.',
    '',
    'Privacy and correction:',
    `- ${canonicalBaseUrl}/privacy/remove-business`,
    '',
  ].join('\n')

  return { body, urls }
}

function buildSitemapXmlFromCatalogs(
  catalogs: readonly PublicCatalog[],
  options: { canonicalBaseUrl: string; now: number }
): { body: string; urls: string[] } {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl)
  const lastmod = new Date(options.now).toISOString()
  const urls = [
    ...staticSitemapPaths.map((path) => `${canonicalBaseUrl}${path}`),
    ...catalogs.map((catalog) => `${canonicalBaseUrl}/${catalog.slug}`),
  ]
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc><lastmod>${lastmod}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n')

  return { body, urls }
}

function buildManifest(
  catalog: PublicCatalog,
  baseUrl: string,
  now: number,
  status: DiscoveryManifest['status']
): DiscoveryManifest {
  const publicUrl = `${baseUrl}/${catalog.slug}`
  const manifestUrl = `${publicUrl}/ucp`
  const routes = [
    { kind: 'business_page' as const, url: publicUrl, routeTested: true as const },
    { kind: 'ucp_manifest' as const, url: manifestUrl, routeTested: true as const },
    { kind: 'api_detail' as const, url: `${baseUrl}/api/businesses/${catalog.slug}`, routeTested: true as const },
  ]
  const body = {
    schemaVersion: 'ae-ucp-fallback:v1' as const,
    businessId: catalog.businessId,
    slug: catalog.slug,
    businessName: safePublicText(catalog.name),
    category: safePublicText(catalog.category),
    location: {
      suburb: safePublicText(catalog.suburb),
      stateTerritory: safePublicText(catalog.stateTerritory),
      ...(catalog.postcode === undefined ? {} : { postcode: safePublicText(catalog.postcode) }),
    },
    publicUrl,
    manifestUrl,
    ucpVersion: 'v1',
    pathKind: 'ae_hosted_fallback' as const,
    status,
    sourceHash: catalog.sourceHash,
    sourceVersion: 'public-catalog:v1' as const,
    updatedAt: catalog.updatedAt,
    routes,
    services: catalog.services.map(toManifestService),
    unsupportedCapabilities: { callable: false as const, paymentRequired: false as const },
    ...(status === 'available' ? {} : { degradedReason: 'Discovery readback is not available for the current source catalog.' }),
  }
  const bodyHash = stableHash(body)
  const urlHash = stableHash({ urls: routes.map((route) => route.url) })
  const generatedHash = stableHash({ bodyHash, sourceHash: catalog.sourceHash, sourceVersion: 'public-catalog:v1', urlHash })
  return {
    ...body,
    generatedHash,
    bodyHash,
    urlHash,
    generatedAt: now,
  }
}

function toManifestService(service: PublicService): ManifestService {
  return {
    slug: service.serviceSlug,
    name: safePublicText(service.name),
    category: safePublicText(service.category),
    summary: safePublicText(service.summary),
    serviceArea: safePublicText(service.serviceArea),
    hoursOrUnknown: safePublicText(service.hoursOrUnknown),
    status: 'published' as const,
    capabilities: service.capabilities.map((capability) => ({
      kind: capability.kind,
      status: capability.status,
      firstRequest: {
        mode: capability.firstRequest.mode,
        publicDisclosure: safePublicText(capability.firstRequest.publicDisclosure),
        publicChannel: capability.firstRequest.publicChannel,
        ...(capability.firstRequest.noContactReason === undefined
          ? {}
          : { noContactReason: safePublicText(capability.firstRequest.noContactReason) }),
      },
      callable: false as const,
      paymentRequired: false as const,
      ...(capability.reason === undefined ? {} : { reason: safePublicText(capability.reason) }),
    })),
  }
}

async function upsertManifest(db: RuntimeWriter, manifest: DiscoveryManifest): Promise<void> {
  const existing = await db
    .query('discoveryManifests')
    .withIndex('by_business_version', (query) => query.eq('businessId', manifest.businessId).eq('ucpVersion', manifest.ucpVersion))
    .unique()
  const patch = manifestPatch(manifest)
  if (existing === null) {
    await db.insert('discoveryManifests', patch)
    return
  }
  await db.patch(existing._id, patch)
}

async function upsertSucceededAttempt(
  db: RuntimeWriter,
  manifest: DiscoveryManifest,
  existing: DiscoveryAttempt | undefined,
  now: number
): Promise<DiscoveryAttempt> {
  const readback = readbackForManifest(manifest, now)
  const attempt = {
    attemptId: `discovery:manifest:${manifest.businessId}:${manifest.sourceHash}:v1`,
    businessId: manifest.businessId,
    ucpVersion: manifest.ucpVersion,
    pathKind: 'ae_hosted_fallback' as const,
    sourceHash: manifest.sourceHash,
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
  const existingDocs = await db
    .query('discoveryManifestAttempts')
    .withIndex('by_business_status', (query) => query.eq('businessId', manifest.businessId))
    .collect()
  const existingDoc = existingDocs.find((candidate) => stringField(candidate, 'attemptId') === attempt.attemptId)
  if (existingDoc === undefined) {
    await db.insert('discoveryManifestAttempts', attemptPatch(attempt))
  } else {
    await db.patch(existingDoc._id, attemptPatch(attempt))
  }
  return attempt
}

async function ensureDiscoveryAuditEvent(
  db: RuntimeWriter,
  manifest: DiscoveryManifest,
  now: number
): Promise<DiscoveryAuditEvent> {
  const eventId = `audit:discovery.generated:${manifest.businessId}:${manifest.sourceHash}`
  const events = await db
    .query('auditEvents')
    .withIndex('by_business_createdAt', (query) => query.eq('businessId', manifest.businessId))
    .collect()
  const existing = events.find((event) => stringField(event, 'eventId') === eventId)
  if (existing !== undefined) {
    return auditFromDoc(existing)
  }
  const redactedPayload = {
    bodyHash: manifest.bodyHash,
    routeCount: manifest.routes.length,
    schemaVersion: manifest.schemaVersion,
    slug: manifest.slug,
    urlHash: manifest.urlHash,
  }
  const event = {
    eventId,
    eventType: 'discovery.generated',
    actorKind: 'system',
    actorRef: 'discovery',
    businessId: manifest.businessId,
    targetType: 'discovery_manifest',
    targetRef: manifest.businessId,
    beforeState: 'queued',
    afterState: 'available',
    idempotencyKey: `op:discovery.generated:${manifest.businessId}:${manifest.sourceHash}`,
    correlationId: `corr:discovery.generated:${manifest.businessId}:${manifest.sourceHash}`,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(redactedPayload),
    payloadHash: stableHash(redactedPayload),
    createdAt: now,
  }
  await db.insert('auditEvents', event)
  return event
}

async function readDiscoveryHealthFromDb(db: RuntimeReader, businessId: string) {
  const business = await db.get(businessId)
  const [catalog, latestAttempt, latestManifest] = await Promise.all([
    business === null ? Promise.resolve<PublicCatalog | undefined>(undefined) : publicCatalogForBusiness(db, business),
    latestAttemptForBusiness(db, businessId),
    latestManifestForBusiness(db, businessId),
  ])
  const sourceHash = catalog?.sourceHash
  const discoveryStatus = healthStatus(catalog !== undefined, latestAttempt, sourceHash)
  return {
    businessId,
    sourceState: catalog === undefined ? 'not_public' as const : 'published' as const,
    discoveryStatus,
    ...(latestManifest === undefined ? {} : { latestManifest }),
    ...(latestAttempt === undefined ? {} : { latestAttempt }),
    affectedPublicSurfaces: latestManifest?.routes.map((route) => route.url) ?? [],
    repairAction: latestAttempt?.repairAction ?? (catalog === undefined ? 'no_repair' as const : 'regenerate_manifest' as const),
    repairResult: latestAttempt?.repairResult ?? 'not_run' as const,
  }
}

async function latestAttemptForBusiness(db: RuntimeReader, businessId: string): Promise<DiscoveryAttempt | undefined> {
  const attempts = await db
    .query('discoveryManifestAttempts')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId))
    .collect()
  const latest = attempts.sort((left, right) => numberField(right, 'startedAt') - numberField(left, 'startedAt')).at(0)
  return latest === undefined ? undefined : attemptFromDoc(latest)
}

async function latestManifestForBusiness(db: RuntimeReader, businessId: string): Promise<DiscoveryManifest | undefined> {
  const manifests = await db
    .query('discoveryManifests')
    .withIndex('by_business_version', (query) => query.eq('businessId', businessId))
    .collect()
  const latest = manifests.sort((left, right) => numberField(right, 'generatedAt') - numberField(left, 'generatedAt')).at(0)
  return latest === undefined ? undefined : manifestFromDoc(latest)
}

function healthStatus(
  sourceAvailable: boolean,
  attempt: DiscoveryAttempt | undefined,
  sourceHash: string | undefined
): 'unavailable' | 'degraded' | 'available' | 'stale' {
  if (!sourceAvailable) {
    return 'unavailable'
  }
  if (attempt === undefined) {
    return 'degraded'
  }
  if (sourceHash !== undefined && attempt.sourceHash !== sourceHash) {
    return 'stale'
  }
  if (attempt.status === 'succeeded') {
    return 'available'
  }
  return attempt.status === 'stale' ? 'stale' : 'degraded'
}

async function indexStatusForBusiness(db: RuntimeReader, businessId: string): Promise<PublicCatalog['indexStatus']> {
  const statuses = await db
    .query('indexStatus')
    .withIndex('by_target_status', (query) => query.eq('targetType', 'business').eq('targetRef', businessId))
    .collect()
  const status = statuses.find(
    (candidate) => stringField(candidate, 'targetType') === 'business' && stringField(candidate, 'targetRef') === businessId
  )
  const value = status === undefined ? undefined : stringField(status, 'status')
  return value === 'queued' || value === 'indexed' || value === 'failed' || value === 'stale' ? value : 'not_queued'
}

function manifestPatch(manifest: DiscoveryManifest): Record<string, unknown> {
  return {
    schemaVersion: manifest.schemaVersion,
    businessId: manifest.businessId,
    slug: manifest.slug,
    businessName: manifest.businessName,
    category: manifest.category,
    suburb: manifest.location.suburb,
    stateTerritory: manifest.location.stateTerritory,
    ...(manifest.location.postcode === undefined ? {} : { postcode: manifest.location.postcode }),
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
    routes: manifest.routes,
    services: manifest.services,
    unsupportedCapabilities: manifest.unsupportedCapabilities,
    ...(manifest.degradedReason === undefined ? {} : { degradedReason: manifest.degradedReason }),
    ...(manifest.suppressedAt === undefined ? {} : { suppressedAt: manifest.suppressedAt }),
  }
}

function attemptPatch(attempt: DiscoveryAttempt): Record<string, unknown> {
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
    ...(attempt.latestReadback === undefined ? {} : { latestReadback: attempt.latestReadback }),
    ...(attempt.latestReadback === undefined ? {} : { latestManifestUrl: attempt.latestReadback.manifestUrl }),
    ...(attempt.latestReadback === undefined ? {} : { latestRouteUrls: attempt.latestReadback.routeUrls }),
    ...(attempt.staleThresholdAt === undefined ? {} : { staleThresholdAt: attempt.staleThresholdAt }),
    repairAction: attempt.repairAction,
    repairResult: attempt.repairResult,
  }
}

function manifestFromDoc(document: RuntimeDocument): DiscoveryManifest {
  return {
    schemaVersion: 'ae-ucp-fallback:v1',
    businessId: stringField(document, 'businessId'),
    slug: stringField(document, 'slug'),
    businessName: stringField(document, 'businessName'),
    category: stringField(document, 'category'),
    location: {
      suburb: stringField(document, 'suburb'),
      stateTerritory: stringField(document, 'stateTerritory'),
      ...(optionalStringField(document, 'postcode') === undefined ? {} : { postcode: stringField(document, 'postcode') }),
    },
    publicUrl: stringField(document, 'publicUrl'),
    manifestUrl: stringField(document, 'manifestUrl'),
    ucpVersion: stringField(document, 'ucpVersion'),
    pathKind: 'ae_hosted_fallback',
    status: discoveryStatus(document),
    sourceHash: stringField(document, 'sourceHash'),
    sourceVersion: 'public-catalog:v1',
    generatedHash: stringField(document, 'generatedHash'),
    bodyHash: stringField(document, 'bodyHash'),
    urlHash: stringField(document, 'urlHash'),
    generatedAt: numberField(document, 'generatedAt'),
    updatedAt: numberField(document, 'updatedAt'),
    routes: routesField(document),
    services: servicesField(document),
    unsupportedCapabilities: { callable: false as const, paymentRequired: false as const },
    ...(optionalStringField(document, 'degradedReason') === undefined ? {} : { degradedReason: stringField(document, 'degradedReason') }),
    ...(optionalNumberField(document, 'suppressedAt') === undefined ? {} : { suppressedAt: numberField(document, 'suppressedAt') }),
  }
}

function attemptFromDoc(document: RuntimeDocument): DiscoveryAttempt {
  const latestReadback = readbackField(document)
  return {
    attemptId: stringField(document, 'attemptId'),
    businessId: stringField(document, 'businessId'),
    ucpVersion: stringField(document, 'ucpVersion'),
    pathKind: 'ae_hosted_fallback',
    sourceHash: stringField(document, 'sourceHash'),
    sourceVersion: 'public-catalog:v1',
    status: attemptStatus(document),
    retryCount: numberField(document, 'retryCount'),
    ...(optionalStringField(document, 'failureCode') === undefined ? {} : { failureCode: stringField(document, 'failureCode') }),
    ...(optionalStringField(document, 'failureMessageRedacted') === undefined ? {} : { failureMessageRedacted: stringField(document, 'failureMessageRedacted') }),
    startedAt: numberField(document, 'startedAt'),
    ...(optionalNumberField(document, 'finishedAt') === undefined ? {} : { finishedAt: numberField(document, 'finishedAt') }),
    ...(optionalStringField(document, 'generatedHash') === undefined ? {} : { generatedHash: stringField(document, 'generatedHash') }),
    ...(optionalStringField(document, 'bodyHash') === undefined ? {} : { bodyHash: stringField(document, 'bodyHash') }),
    ...(optionalStringField(document, 'urlHash') === undefined ? {} : { urlHash: stringField(document, 'urlHash') }),
    ...(latestReadback === undefined ? {} : { latestReadback }),
    ...(optionalNumberField(document, 'staleThresholdAt') === undefined ? {} : { staleThresholdAt: numberField(document, 'staleThresholdAt') }),
    repairAction: discoveryRepairAction(document),
    repairResult: repairResult(document),
  }
}

function auditFromDoc(document: RuntimeDocument): DiscoveryAuditEvent {
  return {
    eventId: stringField(document, 'eventId'),
    eventType: stringField(document, 'eventType'),
    actorKind: stringField(document, 'actorKind'),
    actorRef: stringField(document, 'actorRef'),
    businessId: stringField(document, 'businessId'),
    targetType: stringField(document, 'targetType'),
    targetRef: stringField(document, 'targetRef'),
    beforeState: stringField(document, 'beforeState'),
    afterState: stringField(document, 'afterState'),
    idempotencyKey: stringField(document, 'idempotencyKey'),
    correlationId: stringField(document, 'correlationId'),
    evidenceRefs: stringArrayField(document, 'evidenceRefs'),
    redactedPayloadJson: stringField(document, 'redactedPayloadJson'),
    payloadHash: stringField(document, 'payloadHash'),
    createdAt: numberField(document, 'createdAt'),
  }
}

function readbackForManifest(manifest: DiscoveryManifest, readAt: number): DiscoveryReadback {
  return {
    businessId: manifest.businessId,
    slug: manifest.slug,
    manifestUrl: manifest.manifestUrl,
    sourceVersion: 'public-catalog:v1',
    sourceHash: manifest.sourceHash,
    generatedHash: manifest.generatedHash,
    bodyHash: manifest.bodyHash,
    urlHash: manifest.urlHash,
    routeUrls: manifest.routes.map((route) => route.url),
    readAt,
  }
}

function readbackField(document: RuntimeDocument): DiscoveryReadback | undefined {
  const readback = document.latestReadback
  if (!isRecord(readback)) {
    return undefined
  }
  return {
    businessId: stringFromRecord(readback, 'businessId'),
    slug: stringFromRecord(readback, 'slug'),
    manifestUrl: stringFromRecord(readback, 'manifestUrl'),
    sourceVersion: 'public-catalog:v1',
    sourceHash: stringFromRecord(readback, 'sourceHash'),
    generatedHash: stringFromRecord(readback, 'generatedHash'),
    bodyHash: stringFromRecord(readback, 'bodyHash'),
    urlHash: stringFromRecord(readback, 'urlHash'),
    routeUrls: arrayFromRecord(readback, 'routeUrls'),
    readAt: numberFromRecord(readback, 'readAt'),
  }
}

function routesField(document: RuntimeDocument): DiscoveryManifest['routes'] {
  const routes = document.routes
  if (!Array.isArray(routes)) {
    return []
  }
  const manifestRoutes: DiscoveryManifest['routes'] = []
  for (const route of routes) {
    if (!isRecord(route)) {
      continue
    }
    manifestRoutes.push({
      kind: routeKind(stringFromRecord(route, 'kind')),
      url: stringFromRecord(route, 'url'),
      routeTested: true as const,
    })
  }
  return manifestRoutes
}

function servicesField(document: RuntimeDocument): ManifestService[] {
  const services = document.services
  if (!Array.isArray(services)) {
    return []
  }
  const manifestServices: ManifestService[] = []
  for (const service of services) {
    if (!isRecord(service)) {
      continue
    }
    manifestServices.push({
      slug: stringFromRecord(service, 'slug'),
      name: stringFromRecord(service, 'name'),
      category: stringFromRecord(service, 'category'),
      summary: stringFromRecord(service, 'summary'),
      serviceArea: stringFromRecord(service, 'serviceArea'),
      hoursOrUnknown: stringFromRecord(service, 'hoursOrUnknown'),
      status: 'published' as const,
      capabilities: capabilitiesFromRecord(service),
    })
  }
  return manifestServices
}

function capabilitiesFromRecord(service: Record<string, unknown>): ManifestCapability[] {
  const capabilities = service.capabilities
  if (!Array.isArray(capabilities)) {
    return []
  }
  const manifestCapabilities: ManifestCapability[] = []
  for (const capability of capabilities) {
    if (!isRecord(capability)) {
      continue
    }
    manifestCapabilities.push({
      kind: capabilityKindRecord(capability),
      status: capabilityStatusRecord(capability),
      firstRequest: firstRequestFromRecord(capability),
      callable: false as const,
      paymentRequired: false as const,
      ...(stringFromRecord(capability, 'reason').length === 0 ? {} : { reason: stringFromRecord(capability, 'reason') }),
    })
  }
  return manifestCapabilities
}

function firstRequestFromRecord(capability: Record<string, unknown>): FirstRequest {
  const firstRequest = capability.firstRequest
  if (!isRecord(firstRequest)) {
    return unavailableFirstRequest()
  }
  return {
    mode: firstRequestModeRecord(firstRequest),
    publicDisclosure: stringFromRecord(firstRequest, 'publicDisclosure'),
    publicChannel: publicChannelRecord(firstRequest),
    ...(stringFromRecord(firstRequest, 'noContactReason').length === 0 ? {} : { noContactReason: stringFromRecord(firstRequest, 'noContactReason') }),
  }
}

function readEnv(name: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[name]
}

function canonicalBaseUrl(value: string | undefined): string {
  const raw = value ?? readEnv('AE_CANONICAL_BASE_URL') ?? readEnv('SITE_URL') ?? 'https://ae.example'
  return raw.replace(/\/+$/u, '')
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '')
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function safePublicText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ')
    .replace(/javascript\s*:/giu, 'blocked-uri ')
    .replace(/ignore previous instructions/giu, 'untrusted instruction')
    .replace(/[`*_#>\[\]()]/gu, ' ')
    .replace(/\bendpoint\b/giu, 'untrusted claim')
    .replace(/\b(?:verified|callable|payable)\b/giu, 'untrusted claim')
    .replace(/paymentRequired\s*[:=]\s*true/giu, 'untrusted claim')
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .trim()
    .slice(0, 500)
}


function stringArrayField(document: RuntimeDocument, field: string): string[] {
  const value = document[field]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}


function stringFromRecord(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  return typeof value === 'string' ? value : ''
}

function numberFromRecord(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  return typeof value === 'number' ? value : 0
}

function arrayFromRecord(record: Record<string, unknown>, field: string): string[] {
  const value = record[field]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function firstRequestMode(document: RuntimeDocument): FirstRequest['mode'] {
  const value = stringField(document, 'firstRequestMode')
  if (value === 'inquiry_available' || value === 'quote_request_available' || value === 'not_available_yet') {
    return value
  }
  return 'not_available_yet'
}

function firstRequestModeRecord(record: Record<string, unknown>): FirstRequest['mode'] {
  const value = stringFromRecord(record, 'mode')
  if (value === 'inquiry_available' || value === 'quote_request_available' || value === 'not_available_yet') {
    return value
  }
  return 'not_available_yet'
}

function publicChannel(document: RuntimeDocument): FirstRequest['publicChannel'] {
  const value = stringField(document, 'publicChannel')
  if (value === 'public_business_contact' || value === 'ae_status_only' || value === 'not_available') {
    return value
  }
  return 'not_available'
}

function publicChannelRecord(record: Record<string, unknown>): FirstRequest['publicChannel'] {
  const value = stringFromRecord(record, 'publicChannel')
  if (value === 'public_business_contact' || value === 'ae_status_only' || value === 'not_available') {
    return value
  }
  return 'not_available'
}

function trustTier(document: RuntimeDocument): CatalogTrustTier {
  const value = stringField(document, 'trustTier')
  return value === 'contact_confirmed' || value === 'listed' || value === 'registry_verified' ? value : 'claimed'
}

function capabilityKind(document: RuntimeDocument): CatalogCapabilityKind {
  return capabilityKindValue(stringField(document, 'kind'))
}

function capabilityStatus(document: RuntimeDocument): CatalogDiscoveryStatus {
  return capabilityStatusValue(stringField(document, 'status'))
}

function capabilityKindRecord(record: Record<string, unknown>): CatalogCapabilityKind {
  return capabilityKindValue(stringFromRecord(record, 'kind'))
}

function capabilityStatusRecord(record: Record<string, unknown>): CatalogDiscoveryStatus {
  return capabilityStatusValue(stringFromRecord(record, 'status'))
}

function capabilityKindValue(value: string): CatalogCapabilityKind {
  if (
    value === 'phone_inquiry' ||
    value === 'quote_request' ||
    value === 'booking_interest' ||
    value === 'emergency_callout_interest' ||
    value === 'ae_hosted_discovery'
  ) {
    return value
  }
  return 'ae_hosted_discovery'
}

function capabilityStatusValue(value: string): CatalogDiscoveryStatus {
  if (value === 'available' || value === 'degraded' || value === 'stale') {
    return value
  }
  return 'unavailable'
}

function discoveryStatus(document: RuntimeDocument): DiscoveryManifest['status'] {
  const value = stringField(document, 'status')
  if (value === 'unavailable' || value === 'degraded' || value === 'available' || value === 'stale') {
    return value
  }
  return 'unavailable'
}

function attemptStatus(document: RuntimeDocument): DiscoveryAttempt['status'] {
  const value = stringField(document, 'status')
  if (value === 'queued' || value === 'succeeded' || value === 'failed' || value === 'stale') {
    return value
  }
  return 'queued'
}

function discoveryRepairAction(document: RuntimeDocument): DiscoveryAttempt['repairAction'] {
  const value = stringField(document, 'repairAction')
  if (value === 'regenerate_manifest' || value === 'invalidate_manifest' || value === 'no_repair') {
    return value
  }
  return 'no_repair'
}

function repairResult(document: RuntimeDocument): DiscoveryAttempt['repairResult'] {
  const value = stringField(document, 'repairResult')
  if (value === 'not_run' || value === 'succeeded' || value === 'failed') {
    return value
  }
  return 'not_run'
}

function routeKind(value: string): DiscoveryManifest['routes'][number]['kind'] {
  if (value === 'ucp_manifest' || value === 'api_detail') {
    return value
  }
  return 'business_page'
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
