import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { runtimeDb } from './source_state'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import { stableHash } from '../src/modules/common/stable-hash'
import { validateServiceCatalogInput } from '../src/modules/catalog/public'
import type { ServiceCatalogInput, ValidatedServiceCatalogInput } from '../src/modules/catalog/public'

const firstRequestArg = v.object({
  mode: v.union(v.literal('inquiry_available'), v.literal('quote_request_available'), v.literal('not_available_yet')),
  publicDisclosure: v.optional(v.string()),
  publicChannel: v.union(v.literal('public_business_contact'), v.literal('ae_status_only'), v.literal('not_available')),
  noContactReason: v.optional(v.string()),
  rawContactValue: v.optional(v.string()),
})

const serviceArg = v.object({
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceArea: v.string(),
  hoursOrUnknown: v.string(),
  firstRequest: firstRequestArg,
})

const firstRequestResult = v.object({
  mode: v.union(v.literal('inquiry_available'), v.literal('quote_request_available'), v.literal('not_available_yet')),
  publicDisclosure: v.string(),
  publicChannel: v.union(v.literal('public_business_contact'), v.literal('ae_status_only'), v.literal('not_available')),
  noContactReason: v.optional(v.string()),
  rawContactExcluded: v.literal(true),
})

const capabilityResult = v.object({
  serviceId: v.string(),
  kind: v.union(
    v.literal('phone_inquiry'),
    v.literal('quote_request'),
    v.literal('booking_interest'),
    v.literal('emergency_callout_interest'),
    v.literal('ae_hosted_discovery')
  ),
  status: v.union(v.literal('available'), v.literal('degraded'), v.literal('unavailable'), v.literal('stale')),
  firstRequest: firstRequestResult,
  callable: v.literal(false),
  paymentRequired: v.literal(false),
  reason: v.optional(v.string()),
  sourceHash: v.string(),
})

const publicServiceResult = v.object({
  serviceId: v.string(),
  serviceSlug: v.string(),
  businessId: v.string(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceArea: v.string(),
  hoursOrUnknown: v.string(),
  firstRequest: firstRequestResult,
  status: v.literal('published'),
  capabilities: v.array(capabilityResult),
  sourceHash: v.string(),
})

const publicCatalogResult = v.object({
  businessId: v.string(),
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  postcode: v.optional(v.string()),
  publicUrl: v.string(),
  publicStatus: v.literal('published'),
  trustTier: v.union(v.literal('claimed'), v.literal('contact_confirmed'), v.literal('listed'), v.literal('registry_verified')),
  indexStatus: v.union(v.literal('not_queued'), v.literal('queued'), v.literal('indexed'), v.literal('failed'), v.literal('stale')),
  discoveryStatus: v.union(v.literal('unavailable'), v.literal('degraded'), v.literal('available'), v.literal('stale')),
  services: v.array(publicServiceResult),
  sourceHash: v.string(),
  schemaVersion: v.literal('public-catalog:v1'),
  updatedAt: v.number(),
})

const publicCatalogReadbackResult = v.union(
  v.object({
    kind: v.literal('available'),
    catalog: publicCatalogResult,
  }),
  v.object({
    kind: v.literal('not_found'),
    reason: v.literal('not_public'),
  })
)

const auditEventResult = v.object({
  eventId: v.string(),
  eventType: v.string(),
  actorKind: v.string(),
  actorRef: v.string(),
  authSessionRef: v.optional(v.string()),
  orgRef: v.optional(v.string()),
  businessId: v.optional(v.string()),
  slug: v.optional(v.string()),
  targetType: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  redactedPayloadJson: v.string(),
  payloadHash: v.string(),
  failureCode: v.optional(v.string()),
  createdAt: v.number(),
})

const registryAttemptResult = v.object({
  businessId: v.string(),
  serviceId: v.optional(v.string()),
  logicalKey: v.string(),
  projectionKind: v.union(v.literal('business_catalog'), v.literal('service_catalog')),
  sourceHash: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  status: v.union(v.literal('queued'), v.literal('succeeded'), v.literal('failed'), v.literal('stale')),
  retryCount: v.number(),
  retryAfter: v.optional(v.number()),
  lastErrorCode: v.optional(v.string()),
  lastErrorRedacted: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  staleThresholdAt: v.optional(v.number()),
  repairAction: v.union(v.literal('retry_projection'), v.literal('rebuild_projection'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

const discoveryAttemptResult = v.object({
  attemptId: v.string(),
  businessId: v.string(),
  ucpVersion: v.string(),
  pathKind: v.literal('ae_hosted_fallback'),
  sourceHash: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  status: v.union(v.literal('queued'), v.literal('succeeded'), v.literal('failed'), v.literal('stale')),
  retryCount: v.number(),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  staleThresholdAt: v.optional(v.number()),
  repairAction: v.union(v.literal('regenerate_manifest'), v.literal('invalidate_manifest'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

const catalogErrorCode = v.union(
  v.literal('catalog_publish_unauthenticated'),
  v.literal('catalog_publish_csrf_rejected'),
  v.literal('catalog_publish_claim_not_found'),
  v.literal('catalog_publish_wrong_owner'),
  v.literal('catalog_publish_pending_review'),
  v.literal('catalog_publish_invalid_services'),
  v.literal('catalog_publish_operation_conflict')
)

const catalogErrorResult = v.object({
  kind: v.literal('error'),
  code: catalogErrorCode,
  retryable: v.boolean(),
  reason: v.string(),
})

const catalogOkResult = v.object({
  kind: v.literal('ok'),
  code: v.union(v.literal('catalog_published'), v.literal('catalog_publish_replayed')),
  business: v.object({
    businessId: v.string(),
    ownerId: v.string(),
    slug: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    category: v.string(),
    suburb: v.string(),
    stateTerritory: v.string(),
    publicStatus: v.literal('published'),
    trustTier: v.union(v.literal('claimed'), v.literal('contact_confirmed'), v.literal('listed'), v.literal('registry_verified')),
    claimStatus: v.literal('published'),
    sourceHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  claim: v.object({
    claimId: v.string(),
    ownerId: v.string(),
    businessId: v.string(),
    slug: v.string(),
    status: v.literal('published'),
    submittedFactsHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  catalog: publicCatalogResult,
  auditEvent: auditEventResult,
  registryProjectionAttempts: v.array(registryAttemptResult),
  discoveryManifestAttempts: v.array(discoveryAttemptResult),
})

export const publishBusinessCatalog = mutationGeneric({
  args: {
    claimId: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    ...sourceWriteArgs,
    services: v.array(serviceArg),
  },
  returns: v.union(catalogOkResult, catalogErrorResult),
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') {
      return catalogError('catalog_publish_csrf_rejected', sourceWrite.reason)
    }

    const actor = await resolveBusinessActor(ctx, args)
    if (actor.kind !== 'authenticated_owner') {
      return catalogError('catalog_publish_unauthenticated', 'Authentication is required to publish a business catalog.')
    }

    const db = runtimeDb(ctx.db)

    const claim = await db.get(args.claimId)
    if (claim === null) {
      return catalogError('catalog_publish_claim_not_found', 'Claim was not found.')
    }

    const claimStatus = stringField(claim, 'status')
    if (claimStatus === 'contested' || claimStatus === 'disputed') {
      return catalogError('catalog_publish_pending_review', 'Claim must finish review before publishing.')
    }

    const ownerId = stringField(claim, 'ownerId')
    const businessId = optionalStringField(claim, 'businessId')
    if (businessId === undefined) {
      return catalogError('catalog_publish_claim_not_found', 'Claim source state is incomplete.')
    }

    const owner = await db.get(ownerId)
    if (owner === null || stringField(owner, 'clerkUserId') !== actor.clerkUserId) {
      return catalogError('catalog_publish_wrong_owner', 'Only the source-bound owner can publish this catalog.')
    }

    const business = await db.get(businessId)
    const context = await db
      .query('businessContexts')
      .withIndex('by_business', (query) => query.eq('businessId', businessId))
      .unique()
    if (business === null || context === null) {
      return catalogError('catalog_publish_claim_not_found', 'Claim source state is incomplete.')
    }

    const normalizedServices: ServiceCatalogInput[] = []
    for (const service of args.services) {
      const normalizedService = toServiceInput(service)
      if (normalizedService.kind === 'invalid') {
        return catalogError('catalog_publish_invalid_services', 'invalid_first_request')
      }
      normalizedServices.push(normalizedService.service)
    }
    const validation = validateServiceCatalogInput(normalizedServices)
    if (validation.kind === 'invalid') {
      return catalogError('catalog_publish_invalid_services', validation.reason)
    }

    const requestHash = stableHash({
      claimId: args.claimId,
      services: validation.services.map((service) => ({
        category: service.category,
        firstRequest: {
          mode: service.firstRequest.mode,
          noContactReason: service.firstRequest.noContactReason ?? '',
          publicChannel: service.firstRequest.publicChannel,
          publicDisclosure: service.firstRequest.publicDisclosure,
        },
        name: service.name,
        serviceArea: service.serviceArea,
        summary: service.summary,
      })),
    })
    const existingOperation = await db
      .query('operationKeys')
      .withIndex('by_actor_operation_key', (query) =>
        query.eq('actorRef', ownerId).eq('operationName', 'publishBusinessCatalog').eq('key', args.operationKey)
      )
      .unique()
    if (existingOperation !== null) {
      if (stringField(existingOperation, 'requestHash') !== requestHash || stringField(existingOperation, 'status') !== 'succeeded') {
        return catalogError('catalog_publish_operation_conflict', 'Operation key is already reserved for a different publish request.')
      }
      const replayCatalog = await publicCatalogForBusiness(db, businessId)
      const replayAudit = await findPublishAuditEvent(db, businessId, args.operationKey, args.correlationId)
      if (replayCatalog === undefined || replayAudit === undefined) {
        return catalogError('catalog_publish_operation_conflict', 'Published operation readback is incomplete.')
      }
      const replayBusiness = publishedBusinessContract(businessId, business, nowFromDoc(existingOperation))
      const replayClaim = publishedClaimContract(args.claimId, claim, businessId, nowFromDoc(existingOperation))
      return {
        kind: 'ok' as const,
        code: 'catalog_publish_replayed' as const,
        business: replayBusiness,
        claim: replayClaim,
        catalog: replayCatalog,
        auditEvent: replayAudit,
        registryProjectionAttempts: await registryAttemptsForBusiness(db, businessId),
        discoveryManifestAttempts: await discoveryAttemptsForBusiness(db, businessId),
      }
    }

    const now = Date.now()
    const operationId = await db.insert('operationKeys', {
      scope: 'catalog',
      actorKind: 'owner',
      actorRef: ownerId,
      operationName: 'publishBusinessCatalog',
      key: args.operationKey,
      requestHash,
      sourceHash: stringField(business, 'sourceHash'),
      status: 'in_progress',
      effectRefs: [],
      createdAt: now,
      updatedAt: now,
    })

    await db.patch(businessId, { publicStatus: 'published', claimStatus: 'published', updatedAt: now })
    await db.patch(args.claimId, { status: 'published', updatedAt: now })
    const services = await upsertServices(db, businessId, validation.services, now)
    const catalog = await publicCatalogForBusiness(db, businessId)
    if (catalog === undefined) {
      return catalogError('catalog_publish_invalid_services', 'no_published_services')
    }

    const auditEvent = await ensurePublishAuditEvent(db, businessId, ownerId, stringField(business, 'slug'), args, now)
    const registryAttempts = await ensureRegistryAttempts(db, businessId, stringField(business, 'sourceHash'), services, now)
    const discoveryAttempts = await ensureDiscoveryAttempt(db, businessId, stringField(business, 'sourceHash'), now)
    await upsertBusinessIndexStatus(db, businessId, stringField(business, 'sourceHash'), now)
    await db.patch(operationId, {
      status: 'succeeded',
      resultHash: stableHash({ auditEventId: auditEvent.eventId, businessId, slug: stringField(business, 'slug') }),
      effectRefs: [auditEvent.eventId, ...registryAttempts.map((attempt) => attempt.logicalKey), ...discoveryAttempts.map((attempt) => attempt.attemptId)],
      updatedAt: now,
    })

    const publishedBusiness = publishedBusinessContract(businessId, business, now)
    const publishedClaim = publishedClaimContract(args.claimId, claim, businessId, now)
    return {
      kind: 'ok' as const,
      code: 'catalog_published' as const,
      business: publishedBusiness,
      claim: publishedClaim,
      catalog,
      auditEvent,
      registryProjectionAttempts: registryAttempts,
      discoveryManifestAttempts: discoveryAttempts,
    }
  },
})

export const getPublicBusinessCatalogBySlug = queryGeneric({
  args: {
    slug: v.string(),
  },
  returns: publicCatalogReadbackResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const business = await db
      .query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', normalizeSlug(args.slug)))
      .unique()
    if (business === null) {
      return catalogReadNotFound()
    }

    const catalog = await publicCatalogForBusiness(db, business._id)
    return catalog === undefined ? catalogReadNotFound() : { kind: 'available' as const, catalog }
  },
})

export const getCurrentOwnerPublicCatalog = queryGeneric({
  args: {},
  returns: publicCatalogReadbackResult,
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return catalogReadNotFound()
    }

    const db = runtimeDb(ctx.db)
    const owner = await db
      .query('owners')
      .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
      .unique()
    if (owner === null) {
      return catalogReadNotFound()
    }

    const publishedClaims = await db
      .query('claims')
      .withIndex('by_owner_status', (query) => query.eq('ownerId', owner._id).eq('status', 'published'))
      .collect()
    const orderedClaims = publishedClaims.sort((left, right) => numberField(right, 'updatedAt') - numberField(left, 'updatedAt'))
    for (const claim of orderedClaims) {
      const businessId = optionalStringField(claim, 'businessId')
      if (businessId === undefined) {
        continue
      }

      const catalog = await publicCatalogForBusiness(db, businessId)
      if (catalog !== undefined) {
        return { kind: 'available' as const, catalog }
      }
    }

    return catalogReadNotFound()
  },
})

type ServiceInput = {
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  firstRequest: {
    mode: 'inquiry_available' | 'quote_request_available' | 'not_available_yet'
    publicDisclosure?: string
    publicChannel: 'public_business_contact' | 'ae_status_only' | 'not_available'
    noContactReason?: string
    rawContactValue?: string
  }
}

type NormalizedServiceInput =
  | { kind: 'valid'; service: ServiceCatalogInput }
  | { kind: 'invalid' }

type PersistedService = {
  serviceId: string
  serviceSlug: string
  sourceHash: string
}

type CatalogTrustTier = 'claimed' | 'contact_confirmed' | 'listed' | 'registry_verified'
type CatalogIndexStatus = 'not_queued' | 'queued' | 'indexed' | 'failed' | 'stale'
type CatalogDiscoveryStatus = 'unavailable' | 'degraded' | 'available' | 'stale'
type CatalogCapabilityKind = 'phone_inquiry' | 'quote_request' | 'booking_interest' | 'emergency_callout_interest' | 'ae_hosted_discovery'


type PublicCatalog = {
  businessId: string
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  postcode?: string
  publicUrl: string
  publicStatus: 'published'
  trustTier: CatalogTrustTier
  indexStatus: CatalogIndexStatus
  discoveryStatus: CatalogDiscoveryStatus
  services: PublicService[]
  sourceHash: string
  schemaVersion: 'public-catalog:v1'
  updatedAt: number
}

type PublicService = {
  serviceId: string
  serviceSlug: string
  businessId: string
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  firstRequest: FirstRequest
  status: 'published'
  capabilities: PublicCapability[]
  sourceHash: string
}

type FirstRequest = {
  mode: 'inquiry_available' | 'quote_request_available' | 'not_available_yet'
  publicDisclosure: string
  publicChannel: 'public_business_contact' | 'ae_status_only' | 'not_available'
  noContactReason?: string
  rawContactExcluded: true
}

type PublicCapability = {
  serviceId: string
  kind: CatalogCapabilityKind
  status: CatalogDiscoveryStatus
  firstRequest: FirstRequest
  callable: false
  paymentRequired: false
  reason?: string
  sourceHash: string
}

type AuditEvent = {
  eventId: string
  eventType: string
  actorKind: string
  actorRef: string
  businessId?: string
  slug?: string
  targetType: string
  targetRef: string
  beforeState?: string
  afterState?: string
  idempotencyKey: string
  correlationId: string
  evidenceRefs: string[]
  redactedPayloadJson: string
  payloadHash: string
  createdAt: number
}

type RegistryAttempt = {
  businessId: string
  serviceId?: string
  logicalKey: string
  projectionKind: 'business_catalog' | 'service_catalog'
  sourceHash: string
  sourceVersion: 'public-catalog:v1'
  status: 'queued'
  retryCount: number
  startedAt: number
  repairAction: 'rebuild_projection'
  repairResult: 'not_run'
}

type DiscoveryAttempt = {
  attemptId: string
  businessId: string
  ucpVersion: string
  pathKind: 'ae_hosted_fallback'
  sourceHash: string
  sourceVersion: 'public-catalog:v1'
  status: 'queued'
  retryCount: number
  startedAt: number
  repairAction: 'regenerate_manifest'
  repairResult: 'not_run'
}

function catalogError(
  code:
    | 'catalog_publish_unauthenticated'
    | 'catalog_publish_csrf_rejected'
    | 'catalog_publish_claim_not_found'
    | 'catalog_publish_wrong_owner'
    | 'catalog_publish_pending_review'
    | 'catalog_publish_invalid_services'
    | 'catalog_publish_operation_conflict',
  reason: string,
  retryable = false
) {
  return { kind: 'error' as const, code, retryable, reason }
}

function toServiceInput(service: ServiceInput): NormalizedServiceInput {
  const firstRequest = service.firstRequest
  if (firstRequest.mode === 'not_available_yet') {
    if (
      (firstRequest.publicChannel !== 'ae_status_only' && firstRequest.publicChannel !== 'not_available') ||
      firstRequest.noContactReason === undefined
    ) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'valid',
      service: {
        ...service,
        firstRequest: {
          mode: firstRequest.mode,
          ...(firstRequest.publicDisclosure === undefined ? {} : { publicDisclosure: firstRequest.publicDisclosure }),
          publicChannel: firstRequest.publicChannel,
          noContactReason: firstRequest.noContactReason,
        },
      },
    }
  }

  if (
    (firstRequest.publicChannel !== 'public_business_contact' && firstRequest.publicChannel !== 'ae_status_only') ||
    firstRequest.publicDisclosure === undefined
  ) {
    return { kind: 'invalid' }
  }

  return {
    kind: 'valid',
    service: {
      ...service,
      firstRequest: {
        mode: firstRequest.mode,
        publicDisclosure: firstRequest.publicDisclosure,
        publicChannel: firstRequest.publicChannel,
        ...(firstRequest.rawContactValue === undefined ? {} : { rawContactValue: firstRequest.rawContactValue }),
      },
    },
  }
}

async function upsertServices(db: RuntimeDb, businessId: string, services: readonly ValidatedServiceCatalogInput[], now: number): Promise<PersistedService[]> {
  const nextSlugs: string[] = []
  const persisted: PersistedService[] = []
  for (const [sortOrder, service] of services.entries()) {
    const serviceSlug = normalizeSlug(service.name)
    nextSlugs.push(serviceSlug)
    const sourceHash = stableHash({
      businessId,
      category: service.category,
      name: service.name,
      serviceArea: service.serviceArea,
      summary: service.summary,
    })
    const existingService = await db
      .query('businessServices')
      .withIndex('by_slug_serviceSlug', (query) => query.eq('serviceSlug', serviceSlug).eq('businessId', businessId))
      .unique()
    const servicePatch = {
      businessId,
      serviceSlug,
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceArea: service.serviceArea,
      hoursOrUnknown: service.hoursOrUnknown,
      status: 'published',
      sortOrder,
      sourceHash,
      updatedAt: now,
    }
    const serviceId =
      existingService === null
        ? await db.insert('businessServices', { ...servicePatch, createdAt: now })
        : await patchExistingService(db, existingService, servicePatch)
    await upsertCapability(db, businessId, serviceId, service.firstRequest, now)
    persisted.push({ serviceId, serviceSlug, sourceHash })
  }

  const currentServices = await db
    .query('businessServices')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId).eq('status', 'published'))
    .collect()
  for (const service of currentServices) {
    if (!nextSlugs.includes(stringField(service, 'serviceSlug'))) {
      await db.patch(service._id, { status: 'draft', updatedAt: now })
    }
  }

  return persisted
}

async function patchExistingService(db: RuntimeDb, existingService: RuntimeDocument, servicePatch: Record<string, unknown>): Promise<string> {
  await db.patch(existingService._id, servicePatch)
  return existingService._id
}

async function upsertCapability(db: RuntimeDb, businessId: string, serviceId: string, firstRequest: FirstRequest, now: number): Promise<void> {
  const kind = firstRequest.mode === 'quote_request_available' ? 'quote_request' : 'phone_inquiry'
  const status = firstRequest.mode === 'not_available_yet' ? 'unavailable' : 'available'
  const sourceHash = stableHash({ firstRequestMode: firstRequest.mode, serviceId })
  const existingCapabilities = await db
    .query('serviceCapabilities')
    .withIndex('by_business_service_status', (query) => query.eq('businessId', businessId).eq('serviceId', serviceId))
    .collect()
  const capabilityPatch = {
    businessId,
    serviceId,
    kind,
    status,
    firstRequestMode: firstRequest.mode,
    publicDisclosure: firstRequest.publicDisclosure,
    publicChannel: firstRequest.publicChannel,
    ...(firstRequest.noContactReason === undefined ? {} : { noContactReason: firstRequest.noContactReason, reason: firstRequest.noContactReason }),
    callable: false,
    paymentRequired: false,
    sourceHash,
    updatedAt: now,
  }
  const existing = existingCapabilities.at(0)
  if (existing === undefined) {
    await db.insert('serviceCapabilities', { ...capabilityPatch, createdAt: now })
    return
  }

  await db.patch(existing._id, capabilityPatch)
}

async function publicCatalogForBusiness(db: RuntimeDb, businessId: string): Promise<PublicCatalog | undefined> {
  const business = await db.get(businessId)
  if (business === null || stringField(business, 'publicStatus') !== 'published') {
    return undefined
  }
  if (await hasActiveBusinessSuppression(db, businessId)) {
    return undefined
  }
  const context = await db
    .query('businessContexts')
    .withIndex('by_business', (query) => query.eq('businessId', businessId))
    .unique()
  if (context === null) {
    return undefined
  }
  const services = await db
    .query('businessServices')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId).eq('status', 'published'))
    .collect()
  if (services.length === 0) {
    return undefined
  }
  const capabilities = await db
    .query('serviceCapabilities')
    .withIndex('by_business_service_status', (query) => query.eq('businessId', businessId))
    .collect()
  const indexStatus = await indexStatusForBusiness(db, businessId)
  const discoveryStatus = await discoveryStatusForBusiness(db, businessId, stringField(business, 'sourceHash'))
  return {
    businessId,
    slug: stringField(business, 'slug'),
    name: stringField(business, 'name'),
    category: stringField(context, 'category'),
    suburb: stringField(context, 'suburb'),
    stateTerritory: stringField(context, 'stateTerritory'),
    ...(optionalStringField(context, 'postcode') === undefined ? {} : { postcode: stringField(context, 'postcode') }),
    publicUrl: `/${stringField(business, 'slug')}`,
    publicStatus: 'published',
    trustTier: trustTier(business),
    indexStatus,
    discoveryStatus,
    services: services
      .sort((left, right) => numberField(left, 'sortOrder') - numberField(right, 'sortOrder'))
      .map((service) => toPublicService(service, capabilities)),
    sourceHash: stringField(business, 'sourceHash'),
    schemaVersion: 'public-catalog:v1',
    updatedAt: numberField(business, 'updatedAt'),
  }
}

function catalogReadNotFound() {
  return { kind: 'not_found' as const, reason: 'not_public' as const }
}

function toPublicService(service: RuntimeDocument, capabilities: readonly RuntimeDocument[]): PublicService {
  const serviceCapabilities = capabilities
    .filter((capability) => stringField(capability, 'serviceId') === service._id)
    .map(toPublicCapability)
  const firstRequest = serviceCapabilities.at(0)?.firstRequest ?? {
    mode: 'not_available_yet' as const,
    publicDisclosure: 'First request is not available yet.',
    publicChannel: 'not_available' as const,
    noContactReason: 'Owner has not supplied public contact instructions.',
    rawContactExcluded: true as const,
  }
  return {
    serviceId: service._id,
    serviceSlug: stringField(service, 'serviceSlug'),
    businessId: stringField(service, 'businessId'),
    name: stringField(service, 'name'),
    category: stringField(service, 'category'),
    summary: stringField(service, 'summary'),
    serviceArea: stringField(service, 'serviceArea'),
    hoursOrUnknown: stringField(service, 'hoursOrUnknown'),
    firstRequest,
    status: 'published',
    capabilities: serviceCapabilities,
    sourceHash: stringField(service, 'sourceHash'),
  }
}

function toPublicCapability(capability: RuntimeDocument): PublicCapability {
  return {
    serviceId: stringField(capability, 'serviceId'),
    kind: capabilityKind(capability),
    status: capabilityStatus(capability),
    firstRequest: {
      mode: firstRequestMode(capability),
      publicDisclosure: stringField(capability, 'publicDisclosure'),
      publicChannel: publicChannel(capability),
      ...(optionalStringField(capability, 'noContactReason') === undefined ? {} : { noContactReason: stringField(capability, 'noContactReason') }),
      rawContactExcluded: true,
    },
    callable: false,
    paymentRequired: false,
    ...(optionalStringField(capability, 'reason') === undefined ? {} : { reason: stringField(capability, 'reason') }),
    sourceHash: stringField(capability, 'sourceHash'),
  }
}

async function ensurePublishAuditEvent(
  db: RuntimeDb,
  businessId: string,
  ownerId: string,
  slug: string,
  args: { operationKey: string; correlationId: string },
  now: number
): Promise<AuditEvent> {
  const eventId = `audit:claim.published:${businessId}:${args.operationKey}`
  const existing = await findPublishAuditEvent(db, businessId, args.operationKey, args.correlationId)
  if (existing !== undefined) {
    return existing
  }
  const redactedPayload = { replayed: false, slug }
  const auditEvent = {
    eventId,
    eventType: 'claim.published',
    actorKind: 'owner',
    actorRef: ownerId,
    businessId,
    slug,
    targetType: 'business',
    targetRef: businessId,
    beforeState: 'authenticated',
    afterState: 'published',
    idempotencyKey: args.operationKey,
    correlationId: args.correlationId,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(redactedPayload),
    payloadHash: stableHash(redactedPayload),
    createdAt: now,
  }
  await db.insert('auditEvents', auditEvent)
  return auditEvent
}

async function findPublishAuditEvent(
  db: RuntimeDb,
  businessId: string,
  operationKey: string,
  correlationId: string
): Promise<AuditEvent | undefined> {
  const events = await db
    .query('auditEvents')
    .withIndex('by_correlationId', (query) => query.eq('correlationId', correlationId))
    .collect()
  const event = events.find(
    (candidate) =>
      stringField(candidate, 'businessId') === businessId &&
      stringField(candidate, 'idempotencyKey') === operationKey &&
      stringField(candidate, 'eventType') === 'claim.published'
  )
  if (event === undefined) {
    return undefined
  }

  return {
    eventId: stringField(event, 'eventId'),
    eventType: stringField(event, 'eventType'),
    actorKind: stringField(event, 'actorKind'),
    actorRef: stringField(event, 'actorRef'),
    businessId: stringField(event, 'businessId'),
    ...(optionalStringField(event, 'slug') === undefined ? {} : { slug: stringField(event, 'slug') }),
    targetType: stringField(event, 'targetType'),
    targetRef: stringField(event, 'targetRef'),
    ...(optionalStringField(event, 'beforeState') === undefined ? {} : { beforeState: stringField(event, 'beforeState') }),
    ...(optionalStringField(event, 'afterState') === undefined ? {} : { afterState: stringField(event, 'afterState') }),
    idempotencyKey: stringField(event, 'idempotencyKey'),
    correlationId: stringField(event, 'correlationId'),
    evidenceRefs: stringArrayField(event, 'evidenceRefs'),
    redactedPayloadJson: stringField(event, 'redactedPayloadJson'),
    payloadHash: stringField(event, 'payloadHash'),
    createdAt: numberField(event, 'createdAt'),
  }
}

async function ensureRegistryAttempts(
  db: RuntimeDb,
  businessId: string,
  businessSourceHash: string,
  services: readonly PersistedService[],
  now: number
): Promise<RegistryAttempt[]> {
  const businessAttempt = await upsertRegistryAttempt(db, {
    businessId,
    logicalKey: `registry:business:${businessId}:${businessSourceHash}`,
    projectionKind: 'business_catalog',
    sourceHash: businessSourceHash,
    sourceVersion: 'public-catalog:v1',
    status: 'queued',
    retryCount: 0,
    startedAt: now,
    repairAction: 'rebuild_projection',
    repairResult: 'not_run',
  })
  const serviceAttempts: RegistryAttempt[] = []
  for (const service of services) {
    serviceAttempts.push(
      await upsertRegistryAttempt(db, {
        businessId,
        serviceId: service.serviceId,
        logicalKey: `registry:service:${service.serviceId}:${service.sourceHash}`,
        projectionKind: 'service_catalog',
        sourceHash: service.sourceHash,
        sourceVersion: 'public-catalog:v1',
        status: 'queued',
        retryCount: 0,
        startedAt: now,
        repairAction: 'rebuild_projection',
        repairResult: 'not_run',
      })
    )
  }
  return [businessAttempt, ...serviceAttempts]
}

async function upsertRegistryAttempt(db: RuntimeDb, attempt: RegistryAttempt): Promise<RegistryAttempt> {
  const existing = await db
    .query('registryProjectionAttempts')
    .withIndex('by_logicalKey', (query) => query.eq('logicalKey', attempt.logicalKey))
    .unique()
  if (existing === null) {
    await db.insert('registryProjectionAttempts', attempt)
  } else {
    await db.patch(existing._id, attempt)
  }
  return attempt
}

async function ensureDiscoveryAttempt(
  db: RuntimeDb,
  businessId: string,
  sourceHash: string,
  now: number
): Promise<DiscoveryAttempt[]> {
  const attempt = {
    attemptId: `discovery:manifest:${businessId}:${sourceHash}:v1`,
    businessId,
    ucpVersion: 'v1',
    pathKind: 'ae_hosted_fallback' as const,
    sourceHash,
    sourceVersion: 'public-catalog:v1' as const,
    status: 'queued' as const,
    retryCount: 0,
    startedAt: now,
    repairAction: 'regenerate_manifest' as const,
    repairResult: 'not_run' as const,
  }
  const existingAttempts = await db
    .query('discoveryManifestAttempts')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId))
    .collect()
  const existing = existingAttempts.find((candidate) => stringField(candidate, 'attemptId') === attempt.attemptId)
  if (existing === undefined) {
    await db.insert('discoveryManifestAttempts', attempt)
  } else {
    await db.patch(existing._id, attempt)
  }
  return [attempt]
}

async function upsertBusinessIndexStatus(db: RuntimeDb, businessId: string, sourceHash: string, now: number): Promise<void> {
  const statuses = await db.query('indexStatus').collect()
  const existing = statuses.find(
    (status) => stringField(status, 'targetType') === 'business' && stringField(status, 'targetRef') === businessId
  )
  const next = {
    targetType: 'business',
    targetRef: businessId,
    businessId,
    status: 'queued',
    lastAttemptAt: now,
    sourceHash,
    sourceVersion: 'public-catalog:v1',
  }
  if (existing === undefined) {
    await db.insert('indexStatus', next)
    return
  }
  await db.patch(existing._id, next)
}

async function registryAttemptsForBusiness(db: RuntimeDb, businessId: string): Promise<RegistryAttempt[]> {
  const attempts = await db
    .query('registryProjectionAttempts')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId))
    .collect()
  return attempts.map((attempt) => ({
    businessId: stringField(attempt, 'businessId'),
    ...(optionalStringField(attempt, 'serviceId') === undefined ? {} : { serviceId: stringField(attempt, 'serviceId') }),
    logicalKey: stringField(attempt, 'logicalKey'),
    projectionKind: projectionKind(attempt),
    sourceHash: stringField(attempt, 'sourceHash'),
    sourceVersion: 'public-catalog:v1',
    status: 'queued',
    retryCount: numberField(attempt, 'retryCount'),
    startedAt: numberField(attempt, 'startedAt'),
    repairAction: 'rebuild_projection',
    repairResult: 'not_run',
  }))
}

async function discoveryAttemptsForBusiness(db: RuntimeDb, businessId: string): Promise<DiscoveryAttempt[]> {
  const attempts = await db
    .query('discoveryManifestAttempts')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId))
    .collect()
  return attempts.map((attempt) => ({
    attemptId: stringField(attempt, 'attemptId'),
    businessId: stringField(attempt, 'businessId'),
    ucpVersion: stringField(attempt, 'ucpVersion'),
    pathKind: 'ae_hosted_fallback',
    sourceHash: stringField(attempt, 'sourceHash'),
    sourceVersion: 'public-catalog:v1',
    status: 'queued',
    retryCount: numberField(attempt, 'retryCount'),
    startedAt: numberField(attempt, 'startedAt'),
    repairAction: 'regenerate_manifest',
    repairResult: 'not_run',
  }))
}

function publishedBusinessContract(businessId: string, business: RuntimeDocument, updatedAt: number) {
  return {
    businessId,
    ownerId: stringField(business, 'ownerId'),
    slug: stringField(business, 'slug'),
    name: stringField(business, 'name'),
    normalizedName: stringField(business, 'normalizedName'),
    category: stringField(business, 'category'),
    suburb: stringField(business, 'suburb'),
    stateTerritory: stringField(business, 'stateTerritory'),
    publicStatus: 'published' as const,
    trustTier: trustTier(business),
    claimStatus: 'published' as const,
    sourceHash: stringField(business, 'sourceHash'),
    createdAt: numberField(business, 'createdAt'),
    updatedAt,
  }
}

function publishedClaimContract(claimId: string, claim: RuntimeDocument, businessId: string, updatedAt: number) {
  return {
    claimId,
    ownerId: stringField(claim, 'ownerId'),
    businessId,
    slug: stringField(claim, 'slug'),
    status: 'published' as const,
    submittedFactsHash: stringField(claim, 'submittedFactsHash'),
    createdAt: numberField(claim, 'createdAt'),
    updatedAt,
  }
}

async function indexStatusForBusiness(db: RuntimeDb, businessId: string): Promise<'not_queued' | 'queued' | 'indexed' | 'failed' | 'stale'> {
  const statuses = await db.query('indexStatus').collect()
  const status = statuses.find(
    (candidate) => stringField(candidate, 'targetType') === 'business' && stringField(candidate, 'targetRef') === businessId
  )
  const value = status === undefined ? undefined : stringField(status, 'status')
  return value === 'queued' || value === 'indexed' || value === 'failed' || value === 'stale' ? value : 'not_queued'
}

async function discoveryStatusForBusiness(
  db: RuntimeDb,
  businessId: string,
  sourceHash: string
): Promise<'unavailable' | 'degraded' | 'available' | 'stale'> {
  const attempts = await db
    .query('discoveryManifestAttempts')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId))
    .collect()
  const latest = attempts.sort((left, right) => numberField(right, 'startedAt') - numberField(left, 'startedAt')).at(0)
  if (latest === undefined) {
    return 'degraded'
  }
  if (stringField(latest, 'sourceHash') !== sourceHash || stringField(latest, 'status') === 'stale') {
    return 'stale'
  }
  return stringField(latest, 'status') === 'succeeded' ? 'available' : 'degraded'
}

async function hasActiveBusinessSuppression(db: RuntimeDb, businessId: string): Promise<boolean> {
  const suppression = await db
    .query('suppressionRules')
    .withIndex('by_target_status', (query) => query.eq('targetType', 'business').eq('targetRef', businessId).eq('status', 'active'))
    .unique()
  return suppression !== null
}

function stringField(document: RuntimeDocument, field: string): string {
  const value = document[field]
  return typeof value === 'string' ? value : ''
}

function optionalStringField(document: RuntimeDocument, field: string): string | undefined {
  const value = document[field]
  return typeof value === 'string' ? value : undefined
}

function numberField(document: RuntimeDocument, field: string): number {
  const value = document[field]
  return typeof value === 'number' ? value : 0
}

function nowFromDoc(document: RuntimeDocument): number {
  const updatedAt = document.updatedAt
  return typeof updatedAt === 'number' ? updatedAt : Date.now()
}

function stringArrayField(document: RuntimeDocument, field: string): string[] {
  const value = document[field]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function firstRequestMode(document: RuntimeDocument): FirstRequest['mode'] {
  const value = stringField(document, 'firstRequestMode')
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

function capabilityKind(document: RuntimeDocument): PublicCapability['kind'] {
  const value = stringField(document, 'kind')
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

function capabilityStatus(document: RuntimeDocument): PublicCapability['status'] {
  const value = stringField(document, 'status')
  return value === 'available' || value === 'degraded' || value === 'stale' ? value : 'unavailable'
}

function projectionKind(document: RuntimeDocument): RegistryAttempt['projectionKind'] {
  return stringField(document, 'projectionKind') === 'service_catalog' ? 'service_catalog' : 'business_catalog'
}

function trustTier(document: RuntimeDocument): PublicCatalog['trustTier'] {
  const value = stringField(document, 'trustTier')
  return value === 'contact_confirmed' || value === 'listed' || value === 'registry_verified' ? value : 'claimed'
}

function normalizeSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return normalized.length === 0 ? 'service' : normalized
}

export type {
  PublicCatalogContract,
  PublicFirstRequestDisclosure,
  PublicServiceContract,
  ServiceCapabilityContract,
  PublishBusinessCatalogCommand,
  PublishBusinessCatalogResult,
} from '../src/modules/catalog/public'
