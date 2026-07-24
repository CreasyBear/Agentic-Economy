import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { readActiveAdminMembership, resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { runtimeDb } from './source_state'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import { stableHash } from '../src/modules/common/stable-hash'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './catalogSupplyProjection'
export {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './catalogSupplyProjection'
import {
  changeOfferingStatusInState,
  createOfferingInState,
  decideCatalogSupplyCutover,
  migrateLegacyServiceToOffering,
  legacyOfferingParityMatches,
  planLegacyOfferingMigrationBatch,
  reviseOfferingInState,
  upsertAccessPathInState,
  withdrawAccessPathInState,
  type OfferingAccessPathDescriptor,
  type OfferingSourceResult,
  type OfferingSourceState,
  validateServiceCatalogInput,
} from '../src/modules/catalog/public'
import { requireAdminAuthority } from '../src/modules/security/public'
import type { AccessPathRef, BusinessId, OfferingRef } from '../src/modules/common/ids'
import type { BusinessServiceRecord, ServiceCapabilityRecord, ServiceCatalogInput, ValidatedServiceCatalogInput } from '../src/modules/catalog/public'

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

const offeringFactsArg = v.object({
  name: v.string(), category: v.string(), summary: v.string(),
  serviceAreaSummary: v.optional(v.string()), availabilitySummary: v.optional(v.string()), pricingSummary: v.optional(v.string()),
})
const humanAccessPathArg = v.object({ kind: v.literal('human_request'), channel: v.union(v.literal('phone'), v.literal('website'), v.literal('ae_inquiry')), disclosure: v.string(), url: v.optional(v.string()) })
const externalAccessPathArg = v.object({
  kind: v.literal('external_operation'), name: v.string(), summary: v.string(), url: v.string(), method: v.optional(v.string()),
  documentationUrl: v.optional(v.string()), interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })),
  authenticationSummary: v.optional(v.string()), pricingSummary: v.optional(v.string()),
  provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')),
})
const offeringCommandResult = v.object({ kind: v.union(v.literal('ok'), v.literal('error')), code: v.string(), reason: v.optional(v.string()), resultRef: v.optional(v.string()), currentRevision: v.optional(v.number()) })

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
  publishedPhone: v.optional(v.string()),
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
    publishedPhone: v.optional(v.string()),
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
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') {
      return catalogError('catalog_publish_csrf_rejected', sourceWrite.reason)
    }

    const actor = await resolveBusinessActor(ctx, args)
    if (actor.kind !== 'authenticated_owner') {
      return catalogError('catalog_publish_unauthenticated', 'Authentication is required to publish a business catalog.')
    }

    return publishBusinessCatalogCommand(runtimeDb(ctx.db), {
      actor,
      claimId: args.claimId,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      services: args.services,
    }, Date.now())
  },
})

export async function publishBusinessCatalogCommand(
  db: RuntimeDb,
  command: {
    actor: { kind: 'authenticated_owner'; clerkUserId: string }
    claimId: string
    operationKey: string
    correlationId: string
    services: readonly ServiceInput[]
  },
  now: number,
) {
    const claim = await db.get(command.claimId)
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
    if (owner === null || stringField(owner, 'clerkUserId') !== command.actor.clerkUserId) {
      return catalogError('catalog_publish_wrong_owner', 'Only the source-bound owner can publish this catalog.')
    }

    const [business, context] = await Promise.all([
      db.get(businessId),
      db
        .query('businessContexts')
        .withIndex('by_business', (query) => query.eq('businessId', businessId))
        .unique(),
    ])
    if (business === null || context === null) {
      return catalogError('catalog_publish_claim_not_found', 'Claim source state is incomplete.')
    }

    const normalizedServices: ServiceCatalogInput[] = []
    for (const service of command.services) {
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
      claimId: command.claimId,
      services: validation.services.map((service) => ({
        category: service.category,
        firstRequest: {
          mode: service.firstRequest.mode,
          noContactReason: service.firstRequest.noContactReason ?? '',
          publicChannel: service.firstRequest.publicChannel,
          publicDisclosure: service.firstRequest.publicDisclosure,
        },
        hoursOrUnknown: service.hoursOrUnknown,
        name: service.name,
        serviceArea: service.serviceArea,
        summary: service.summary,
      })),
    })
    const existingOperation = await db
      .query('operationKeys')
      .withIndex('by_actor_operation_key', (query) =>
        query.eq('actorRef', ownerId).eq('operationName', 'publishBusinessCatalog').eq('key', command.operationKey)
      )
      .unique()
    if (existingOperation !== null) {
      if (stringField(existingOperation, 'requestHash') !== requestHash || stringField(existingOperation, 'status') !== 'succeeded') {
        return catalogError('catalog_publish_operation_conflict', 'Operation key is already reserved for a different publish request.')
      }
      const replayCatalog = await publicCatalogForBusiness(db, businessId)
      if (stringField(existingOperation, 'sourceHash') !== stringField(business, 'sourceHash')) {
        return catalogError('catalog_publish_operation_conflict', 'Published operation source no longer matches this business.')
      }
      const replayAudit = await findPublishAuditEvent(db, businessId, command.operationKey)
      if (replayCatalog === undefined || replayAudit === undefined) {
        return catalogError('catalog_publish_operation_conflict', 'Published operation readback is incomplete.')
      }
      const replayBusiness = publishedBusinessContract(businessId, business, nowFromDoc(existingOperation))
      const replayClaim = publishedClaimContract(command.claimId, claim, businessId, nowFromDoc(existingOperation))
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

    const operationId = await db.insert('operationKeys', {
      scope: 'catalog',
      actorKind: 'owner',
      actorRef: ownerId,
      operationName: 'publishBusinessCatalog',
      key: command.operationKey,
      requestHash,
      sourceHash: stringField(business, 'sourceHash'),
      status: 'in_progress',
      effectRefs: [],
      createdAt: now,
      updatedAt: now,
    })

    await db.patch(businessId, { publicStatus: 'published', claimStatus: 'published', updatedAt: now })
    await db.patch(command.claimId, { status: 'published', updatedAt: now })
    const services = await upsertServices(db, businessId, validation.services, now)
    const catalog = await publicCatalogForBusiness(db, businessId)
    if (catalog === undefined) {
      return catalogError('catalog_publish_invalid_services', 'no_published_services')
    }
    // Projection failure never rolls back source publication. The last safe snapshot remains visible and marked stale.
    await rebuildBusinessSupplyProjectionSnapshotCommand(db, businessId, await deriveBusinessOfferingSupportFromCapabilitySupply(db, businessId, now), now)

    const auditEvent = await ensurePublishAuditEvent(db, businessId, ownerId, stringField(business, 'slug'), command, now)
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
    const publishedClaim = publishedClaimContract(command.claimId, claim, businessId, now)
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
}

export const createBusinessOffering = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs, facts: offeringFactsArg },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, (state, authority, now) => createOfferingInState(state, {
    authority, operationKey: args.operationKey, businessId: args.businessId as unknown as BusinessId, offeringRef: args.offeringRef as OfferingRef, facts: args.facts, now,
  })),
})

export const reviseBusinessOffering = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), ...sourceWriteArgs, facts: offeringFactsArg },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, (state, authority, now) => reviseOfferingInState(state, {
    authority, operationKey: args.operationKey, offeringRef: args.offeringRef as OfferingRef, expectedRevision: args.expectedRevision, facts: args.facts, now,
  })),
})

export const changeBusinessOfferingStatus = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')), ...sourceWriteArgs },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, (state, authority, now) => changeOfferingStatusInState(state, {
    authority, operationKey: args.operationKey, offeringRef: args.offeringRef as OfferingRef, expectedRevision: args.expectedRevision, status: args.status, now,
  })),
})

export const upsertOfferingAccessPath = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), accessPathRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), status: v.union(v.literal('draft'), v.literal('published')), descriptor: v.union(humanAccessPathArg, externalAccessPathArg), ...sourceWriteArgs },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, (state, authority, now) => upsertAccessPathInState(state, {
    authority, operationKey: args.operationKey, offeringRef: args.offeringRef as OfferingRef, accessPathRef: args.accessPathRef as AccessPathRef,
    expectedRevision: args.expectedRevision, status: args.status, descriptor: args.descriptor as OfferingAccessPathDescriptor, now,
  })),
})

export const withdrawOfferingAccessPath = mutationGeneric({
  args: { businessId: v.id('businesses'), accessPathRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), ...sourceWriteArgs },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, (state, authority, now) => withdrawAccessPathInState(state, {
    authority, operationKey: args.operationKey, accessPathRef: args.accessPathRef as AccessPathRef, expectedRevision: args.expectedRevision, now,
  })),
})

async function runOfferingSourceMutation(
  ctx: { db: object; auth: { getUserIdentity: () => Promise<unknown> } },
  args: { businessId: string; operationKey: string; correlationId: string; sourceWrite?: unknown },
  mutate: (state: OfferingSourceState, authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string }, now: number) => OfferingSourceResult<unknown>,
) {
  const admitted = await requireSourceWrite(ctx as never, args as never, 'catalog_publish')
  if (admitted.kind === 'rejected') return { kind: 'error' as const, code: 'operation_conflict', reason: admitted.reason }
  const actor = await resolveBusinessActor(ctx as never, args)
  if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated', reason: 'Authentication is required.' }
  const db = runtimeDb(ctx.db)
  if (!await operatorControlEnabled(db, 'offering_authoring_enabled', Date.now())) {
    return { kind: 'error' as const, code: 'operation_conflict', reason: 'Offering authoring is currently disabled.' }
  }
  const business = await db.get(args.businessId)
  if (business === null) return { kind: 'error' as const, code: 'wrong_owner', reason: 'Business was not found.' }
  const ownerId = stringField(business, 'ownerId')
  const owner = await db.get(ownerId)
  const businessOwnerRef = owner === null ? '' : stringField(owner, 'clerkUserId')
  const state = await loadOfferingSourceState(db, args.businessId, businessOwnerRef)
  const result = mutate(state, { actorRef: actor.clerkUserId, ownerRef: businessOwnerRef, businessOwnerRef }, Date.now())
  if (result.kind === 'error') return { kind: 'error' as const, code: result.code, reason: result.reason }
  const persisted = await persistOfferingSourceState(db, args.businessId, state, result.state)
  if (persisted.kind === 'error') return persisted
  await ensureGreenfieldOfferingCutover(db, args.businessId, Date.now())
  // Source success is authoritative even if the removable projection cannot rebuild.
  await rebuildBusinessSupplyProjectionSnapshotCommand(db, args.businessId, await deriveBusinessOfferingSupportFromCapabilitySupply(db, args.businessId, Date.now()), Date.now())
  const value = result.value as { offeringRef?: string; accessPathRef?: string; currentRevision?: number }
  const resultRef = value.offeringRef ?? value.accessPathRef
  return { kind: 'ok' as const, code: result.code, ...(resultRef === undefined ? {} : { resultRef }), ...(value.currentRevision === undefined ? {} : { currentRevision: value.currentRevision }) }
}

export const retryBusinessSupplyProjection = mutationGeneric({
  args: { businessId: v.id('businesses') }, returns: v.any(),
  handler: async (ctx, args) => {
    const denied = await requireCatalogSupplyAdmin(ctx)
    if (denied) return denied
    const db = runtimeDb(ctx.db)
    return rebuildBusinessSupplyProjectionSnapshotCommand(db, args.businessId, await deriveBusinessOfferingSupportFromCapabilitySupply(db, args.businessId, Date.now()), Date.now())
  },
})

export const migrateLegacyOfferingBatch = mutationGeneric({
  args: { businessId: v.id('businesses'), cursor: v.union(v.string(), v.null()) }, returns: v.any(),
  handler: async (ctx, args) => {
    const denied = await requireCatalogSupplyAdmin(ctx)
    if (denied) return denied
    const db = runtimeDb(ctx.db)
    const page = await ctx.db.query('businessServices')
      .withIndex('by_business_status', (q) => q.eq('businessId', args.businessId))
      .paginate({ cursor: args.cursor, numItems: 50 })
    const services = page.page
    const capabilityPages = await Promise.all(services.map((service) => ctx.db.query('serviceCapabilities')
      .withIndex('by_business_service_status', (q) => (q as any).eq('businessId', args.businessId).eq('serviceId', service._id))
      .take(21)))
    if (capabilityPages.some((rows) => rows.length > 20)) return { kind: 'error' as const, code: 'migration_capability_limit_exceeded' as const }
    const capabilities = capabilityPages.flat()
    const serviceRecords = services.map(toBusinessServiceRecord)
    const capabilityRecords = capabilities.map(toServiceCapabilityRecord)
    const planned = planLegacyOfferingMigrationBatch({ services: serviceRecords, capabilities: capabilityRecords })
    if (!Array.isArray(planned)) return planned
    for (const migration of planned) {
      const existing = await db.query('legacyOfferingCrosswalks').withIndex('by_serviceId', (q) => q.eq('serviceId', migration.crosswalk.serviceId)).unique()
      if (existing !== null && stringField(existing, 'serviceSourceHash') !== migration.crosswalk.serviceSourceHash) {
        return { kind: 'error' as const, code: 'legacy_source_changed' as const, serviceId: migration.crosswalk.serviceId }
      }
      await persistOfferingMigration(db, migration, existing, Date.now())
    }
    if (page.isDone) await upsertCutover(db, args.businessId, { mode: 'compare', lastCheckStatus: 'not_run', postCutoverNativeChanges: false }, Date.now())
    return { kind: 'ok' as const, code: 'legacy_batch_migrated' as const, count: planned.length, nextCursor: page.continueCursor, done: page.isDone }
  },
})

export const changeCatalogSupplyCutover = mutationGeneric({
  args: { businessId: v.id('businesses'), requested: v.union(v.literal('legacy'), v.literal('compare'), v.literal('offering')) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const denied = await requireCatalogSupplyAdmin(ctx)
    if (denied) return denied
    const db = runtimeDb(ctx.db)
    const currentRow = await db.query('catalogSupplyCutovers').withIndex('by_businessId', (q) => q.eq('businessId', args.businessId)).unique()
    const current = currentRow === null ? 'legacy' : cutoverMode(currentRow)
    const parity = await computeCatalogMigrationParity(db, args.businessId)
    const decision = decideCatalogSupplyCutover({ current, requested: args.requested, ...(parity === undefined ? {} : { expectedDigest: parity.expectedDigest as never, observedDigest: parity.observedDigest as never }) })
    if (decision.kind === 'refused') return { kind: 'error' as const, code: decision.code }
    const matched = parity?.matched === true
    await upsertCutover(db, args.businessId, { mode: decision.mode, ...(parity === undefined ? {} : { expectedProjectionDigest: parity.expectedDigest, latestProjectionDigest: parity.observedDigest }), lastCheckStatus: matched ? 'matched' : 'not_run', postCutoverNativeChanges: currentRow?.postCutoverNativeChanges === true }, Date.now())
    if (parity !== undefined) {
      const checkRef = `catalog-check:${args.businessId}:${parity.expectedDigest}:${parity.observedDigest}`
      const existing = await db.query('catalogProjectionChecks').withIndex('by_checkRef', (q) => q.eq('checkRef', checkRef)).unique()
      if (existing === null) await db.insert('catalogProjectionChecks', { businessId: args.businessId, checkRef, mode: decision.mode, expectedDigest: parity.expectedDigest, observedDigest: parity.observedDigest, status: matched ? 'matched' : 'mismatch', ...(matched ? {} : { errorCode: 'projection_mismatch' }), observedAt: Date.now() })
    }
    await rebuildBusinessSupplyProjectionSnapshotCommand(db, args.businessId, await deriveBusinessOfferingSupportFromCapabilitySupply(db, args.businessId, Date.now()), Date.now())
    return { kind: 'ok' as const, code: decision.mode === 'legacy' ? 'catalog_supply_rolled_back' : 'catalog_supply_cutover_changed', mode: decision.mode }
  },
})

async function requireCatalogSupplyAdmin(ctx: { db: object; auth: { getUserIdentity: () => Promise<import('convex/server').UserIdentity | null> } }) {
  const identity = await ctx.auth.getUserIdentity()
  const membership = identity === null ? undefined : await readActiveAdminMembership(runtimeDb(ctx.db), identity)
  const authority = requireAdminAuthority(membership, 'set_operator_control')
  return authority.kind === 'allowed' ? undefined : { kind: 'error' as const, code: 'admin_denied' as const, reason: authority.reason }
}

async function operatorControlEnabled(db: RuntimeDb, key: string, now: number): Promise<boolean> {
  const control = await db.query('operatorControls').withIndex('by_key', (q) => q.eq('key', key)).unique()
  return control !== null && control.enabled === true && (typeof control.expiresAt !== 'number' || control.expiresAt > now)
}

function toBusinessServiceRecord(row: RuntimeDocument): BusinessServiceRecord {
  return {
    serviceId: row._id as never, serviceSlug: stringField(row, 'serviceSlug') as never, businessId: stringField(row, 'businessId') as never,
    name: stringField(row, 'name'), category: stringField(row, 'category'), summary: stringField(row, 'summary'),
    serviceArea: stringField(row, 'serviceArea'), hoursOrUnknown: stringField(row, 'hoursOrUnknown'),
    status: stringField(row, 'status') === 'published' ? 'published' : stringField(row, 'status') === 'suppressed' ? 'suppressed' : 'draft',
    sortOrder: numberField(row, 'sortOrder'), sourceHash: stringField(row, 'sourceHash') as never,
    createdAt: numberField(row, 'createdAt'), updatedAt: numberField(row, 'updatedAt'),
  }
}

function toServiceCapabilityRecord(row: RuntimeDocument): ServiceCapabilityRecord {
  return {
    businessId: stringField(row, 'businessId') as never, serviceId: stringField(row, 'serviceId') as never,
    kind: legacyCapabilityKind(row), status: capabilityStatus(row),
    firstRequest: { mode: firstRequestMode(row), publicDisclosure: stringField(row, 'publicDisclosure'), publicChannel: publicChannel(row), ...(optionalStringField(row, 'noContactReason') ? { noContactReason: stringField(row, 'noContactReason') } : {}), rawContactExcluded: true },
    callable: false, paymentRequired: false, ...(optionalStringField(row, 'reason') ? { reason: stringField(row, 'reason') } : {}),
    sourceHash: stringField(row, 'sourceHash') as never, createdAt: numberField(row, 'createdAt'), updatedAt: numberField(row, 'updatedAt'),
  }
}

async function persistOfferingMigration(db: RuntimeDb, migration: ReturnType<typeof migrateLegacyServiceToOffering>, existingCrosswalk: RuntimeDocument | null, now: number) {
  const existingOffering = await db.query('businessOfferings').withIndex('by_offeringRef', (q) => q.eq('offeringRef', migration.offering.offeringRef)).unique()
  if (existingOffering === null) await db.insert('businessOfferings', migration.offering)
  const existingRevision = await db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (q) => q.eq('offeringRef', migration.revision.offeringRef).eq('revision', migration.revision.revision)).unique()
  if (existingRevision === null) await db.insert('businessOfferingRevisions', migration.revision)
  for (const path of migration.accessPaths) {
    const existingPath = await db.query('offeringAccessPaths').withIndex('by_accessPathRef', (q) => q.eq('accessPathRef', path.accessPathRef)).unique()
    if (existingPath === null) await db.insert('offeringAccessPaths', path)
  }
  const row = { ...migration.crosswalk, businessId: migration.offering.businessId, updatedAt: now }
  if (existingCrosswalk === null) await db.insert('legacyOfferingCrosswalks', { ...row, createdAt: now }); else await db.patch(existingCrosswalk._id, row)
}

async function upsertCutover(db: RuntimeDb, businessId: string, input: { mode: 'legacy' | 'compare' | 'offering'; expectedProjectionDigest?: string; latestProjectionDigest?: string; lastCheckStatus: 'not_run' | 'matched' | 'mismatch'; postCutoverNativeChanges: boolean }, now: number) {
  const existing = await db.query('catalogSupplyCutovers').withIndex('by_businessId', (q) => q.eq('businessId', businessId)).unique()
  const row = { businessId, mode: input.mode, ...(input.expectedProjectionDigest === undefined ? {} : { expectedProjectionDigest: input.expectedProjectionDigest }), ...(input.latestProjectionDigest === undefined ? {} : { latestProjectionDigest: input.latestProjectionDigest }), lastCheckStatus: input.lastCheckStatus, postCutoverNativeChanges: input.postCutoverNativeChanges, updatedAt: now }
  if (existing === null) await db.insert('catalogSupplyCutovers', row); else await db.patch(existing._id, row)
}

function cutoverMode(row: RuntimeDocument): 'legacy' | 'compare' | 'offering' {
  const value = stringField(row, 'mode'); return value === 'compare' || value === 'offering' ? value : 'legacy'
}

function legacyCapabilityKind(row: RuntimeDocument): ServiceCapabilityRecord['kind'] {
  const value = capabilityKind(row)
  return value === 'booking_interest' ? 'ae_hosted_discovery' : value
}

async function computeCatalogMigrationParity(db: RuntimeDb, businessId: string): Promise<{ expectedDigest: string; observedDigest: string; matched: boolean } | undefined> {
  const crosswalks = await db.query('legacyOfferingCrosswalks').withIndex('by_businessId_and_offeringRef', (q) => q.eq('businessId', businessId)).collect()
  if (crosswalks.length === 0) return undefined
  const expectedItems: unknown[] = []
  const observedItems: unknown[] = []
  const persisted = await loadOfferingSourceState(db, businessId, '')
  let matched = true
  for (const crosswalk of crosswalks) {
    const service = await db.get(stringField(crosswalk, 'serviceId'))
    if (service === null || stringField(service, 'sourceHash') !== stringField(crosswalk, 'serviceSourceHash')) { matched = false; continue }
    const capabilityRows = await db.query('serviceCapabilities').withIndex('by_business_service_status', (q) => q.eq('businessId', businessId).eq('serviceId', service._id)).collect()
    const expected = migrateLegacyServiceToOffering({ service: toBusinessServiceRecord(service), capabilities: capabilityRows.map(toServiceCapabilityRecord) })
    const offering = await db.query('businessOfferings').withIndex('by_offeringRef', (q) => q.eq('offeringRef', expected.offering.offeringRef)).unique()
    const revision = await db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (q) => q.eq('offeringRef', expected.offering.offeringRef).eq('revision', expected.revision.revision)).unique()
    const paths = await db.query('offeringAccessPaths').withIndex('by_offeringRef_and_offeringRevision', (q) => q.eq('offeringRef', expected.offering.offeringRef).eq('offeringRevision', expected.revision.revision)).collect()
    expectedItems.push({ offering: expected.offering, revision: expected.revision, accessPaths: expected.accessPaths })
    if (offering === null || revision === null) { matched = false; continue }
    const observed = {
      offering: persisted.offerings.find((item) => item.offeringRef === expected.offering.offeringRef)!,
      revision: persisted.revisions.find((item) => item.offeringRef === expected.offering.offeringRef && item.revision === expected.revision.revision)!,
      accessPaths: persisted.accessPaths.filter((item) => item.offeringRef === expected.offering.offeringRef),
    }
    observedItems.push(observed)
    if (!observed.offering || !observed.revision || !legacyOfferingParityMatches(expected, observed)) matched = false
  }
  const expectedDigest = stableHash(expectedItems as never)
  const observedDigest = matched ? stableHash(observedItems as never) : stableHash({ observedItems, mismatch: true } as never)
  return { expectedDigest, observedDigest, matched: matched && expectedDigest === observedDigest }
}

/**
 * System-callable (no admin gate) offering supply seeding for dev: migrates a
 * business's retained v1 services into offerings, sets the requested cutover
 * mode (honoring the compare->offering parity gate), and rebuilds the supply
 * projection. Reuses the exact migration/cutover/parity helpers the
 * admin-gated mutations use.
 */
export async function seedBusinessOfferingSupplyCommand(
  db: RuntimeDb,
  businessId: string,
  requestedMode: 'legacy' | 'compare' | 'offering',
  now: number,
): Promise<{ kind: 'ok'; migrated: number; mode: 'legacy' | 'compare' | 'offering' } | { kind: 'error'; code: string }> {
  const services = await db.query('businessServices').withIndex('by_business_status', (q) => q.eq('businessId', businessId)).collect()
  if (services.length === 0) return { kind: 'ok', migrated: 0, mode: 'legacy' }
  const capabilityRows = await Promise.all(services.map((service) => db.query('serviceCapabilities')
    .withIndex('by_business_service_status', (q) => q.eq('businessId', businessId).eq('serviceId', service._id)).take(21)))
  if (capabilityRows.some((rows) => rows.length > 20)) return { kind: 'error', code: 'migration_capability_limit_exceeded' }
  const planned = planLegacyOfferingMigrationBatch({
    services: services.map(toBusinessServiceRecord),
    capabilities: capabilityRows.flat().map(toServiceCapabilityRecord),
  })
  if (!Array.isArray(planned)) return { kind: 'error', code: planned.kind === 'refused' ? planned.code : 'migration_refused' }
  for (const migration of planned) {
    const existing = await db.query('legacyOfferingCrosswalks').withIndex('by_serviceId', (q) => q.eq('serviceId', migration.crosswalk.serviceId)).unique()
    if (existing !== null && stringField(existing, 'serviceSourceHash') !== migration.crosswalk.serviceSourceHash) {
      return { kind: 'error', code: 'legacy_source_changed' }
    }
    await persistOfferingMigration(db, migration, existing, now)
  }
  const parity = await computeCatalogMigrationParity(db, businessId)
  let mode: 'legacy' | 'compare' | 'offering' = requestedMode === 'legacy' ? 'legacy' : 'compare'
  if (requestedMode === 'offering') {
    const decision = decideCatalogSupplyCutover({ current: 'compare', requested: 'offering', ...(parity === undefined ? {} : { expectedDigest: parity.expectedDigest as never, observedDigest: parity.observedDigest as never }) })
    mode = decision.kind === 'allowed' ? 'offering' : 'compare'
  }
  const matched = parity?.matched === true
  await upsertCutover(db, businessId, { mode, ...(parity === undefined ? {} : { expectedProjectionDigest: parity.expectedDigest, latestProjectionDigest: parity.observedDigest }), lastCheckStatus: matched ? 'matched' : 'not_run', postCutoverNativeChanges: false }, now)
  await rebuildBusinessSupplyProjectionSnapshotCommand(db, businessId, await deriveBusinessOfferingSupportFromCapabilitySupply(db, businessId, now), now)
  return { kind: 'ok', migrated: planned.length, mode }
}

async function loadOfferingSourceState(db: RuntimeDb, businessId: string, actorRef: string): Promise<OfferingSourceState> {
  const [offerings, revisions, accessPaths, operations] = await Promise.all([
    db.query('businessOfferings').withIndex('by_businessId_and_status', (q) => q.eq('businessId', businessId)).collect(),
    db.query('businessOfferingRevisions').withIndex('by_businessId_and_createdAt', (q) => q.eq('businessId', businessId)).collect(),
    db.query('offeringAccessPaths').withIndex('by_businessId_and_status', (q) => q.eq('businessId', businessId)).collect(),
    db.query('operationKeys').withIndex('by_actor_operation_key', (q) => q.eq('actorRef', actorRef)).collect(),
  ])
  return {
    offerings: offerings.map((row) => ({ offeringRef: stringField(row, 'offeringRef') as OfferingRef, businessId: stringField(row, 'businessId') as BusinessId, currentRevision: numberField(row, 'currentRevision'), status: offeringStatus(row), createdAt: numberField(row, 'createdAt'), updatedAt: numberField(row, 'updatedAt') })),
    revisions: revisions.map((row) => ({ offeringRef: stringField(row, 'offeringRef') as OfferingRef, businessId: stringField(row, 'businessId') as BusinessId, revision: numberField(row, 'revision'), name: stringField(row, 'name'), category: stringField(row, 'category'), summary: stringField(row, 'summary'), ...(optionalStringField(row, 'serviceAreaSummary') ? { serviceAreaSummary: stringField(row, 'serviceAreaSummary') } : {}), ...(optionalStringField(row, 'availabilitySummary') ? { availabilitySummary: stringField(row, 'availabilitySummary') } : {}), ...(optionalStringField(row, 'pricingSummary') ? { pricingSummary: stringField(row, 'pricingSummary') } : {}), sourceHash: stringField(row, 'sourceHash') as never, createdAt: numberField(row, 'createdAt') })),
    accessPaths: accessPaths.map((row) => ({ accessPathRef: stringField(row, 'accessPathRef') as AccessPathRef, businessId: stringField(row, 'businessId') as BusinessId, offeringRef: stringField(row, 'offeringRef') as OfferingRef, offeringRevision: numberField(row, 'offeringRevision'), offeringSourceHash: stringField(row, 'offeringSourceHash') as never, status: accessPathStatus(row), descriptor: row.descriptor as OfferingAccessPathDescriptor, sourceHash: stringField(row, 'sourceHash') as never, createdAt: numberField(row, 'createdAt'), updatedAt: numberField(row, 'updatedAt') })),
    operations: operations.filter((row) => stringField(row, 'scope') === 'catalog_offering').map((row) => ({ actorRef: stringField(row, 'actorRef'), operationName: stringField(row, 'operationName'), operationKey: stringField(row, 'key'), requestHash: stringField(row, 'requestHash') as never, resultRef: stringArrayField(row, 'effectRefs')[0] ?? '' })),
  }
}

export async function persistOfferingSourceState(db: RuntimeDb, businessId: string, before: OfferingSourceState, after: OfferingSourceState): Promise<{ kind: 'ok' } | { kind: 'error'; code: 'operation_conflict'; reason: string }> {
  // Preflight the entire write set before the first patch/insert. Domain refs are globally
  // addressable, but an owner command may never capture another business's ref.
  for (const item of after.offerings) {
    const existing = await db.query('businessOfferings').withIndex('by_offeringRef', (q) => q.eq('offeringRef', item.offeringRef)).unique()
    if (existing !== null && stringField(existing, 'businessId') !== businessId) return { kind: 'error', code: 'operation_conflict', reason: 'Offering reference belongs to another business.' }
  }
  for (const item of after.accessPaths) {
    const existing = await db.query('offeringAccessPaths').withIndex('by_accessPathRef', (q) => q.eq('accessPathRef', item.accessPathRef)).unique()
    if (existing !== null && stringField(existing, 'businessId') !== businessId) return { kind: 'error', code: 'operation_conflict', reason: 'Access path reference belongs to another business.' }
  }
  for (const item of after.offerings) {
    const existing = await db.query('businessOfferings').withIndex('by_offeringRef', (q) => q.eq('offeringRef', item.offeringRef)).unique()
    if (existing) await db.patch(existing._id, item); else await db.insert('businessOfferings', item)
  }
  for (const revision of after.revisions.slice(before.revisions.length)) await db.insert('businessOfferingRevisions', revision)
  for (const item of after.accessPaths) {
    const existing = await db.query('offeringAccessPaths').withIndex('by_accessPathRef', (q) => q.eq('accessPathRef', item.accessPathRef)).unique()
    if (existing) await db.patch(existing._id, item); else await db.insert('offeringAccessPaths', item)
  }
  for (const op of after.operations.slice(before.operations.length)) await db.insert('operationKeys', { scope: 'catalog_offering', actorKind: 'owner', actorRef: op.actorRef, operationName: op.operationName, key: op.operationKey, requestHash: op.requestHash, status: 'succeeded', effectRefs: [op.resultRef], createdAt: Date.now(), updatedAt: Date.now() })
  return { kind: 'ok' }
}

/** First native Offering write opts a truly greenfield business into the new source model. */
export async function ensureGreenfieldOfferingCutover(db: RuntimeDb, businessId: string, now: number): Promise<'created' | 'existing' | 'legacy_preserved'> {
  const existing = await db.query('catalogSupplyCutovers').withIndex('by_businessId', (q) => q.eq('businessId', businessId)).unique()
  if (existing !== null) return 'existing'
  const legacy = await db.query('businessServices').withIndex('by_business_status', (q) => q.eq('businessId', businessId)).take?.(1)
    ?? (await db.query('businessServices').withIndex('by_business_status', (q) => q.eq('businessId', businessId)).collect()).slice(0, 1)
  if (legacy.length > 0) return 'legacy_preserved'
  await db.insert('catalogSupplyCutovers', {
    businessId,
    mode: 'offering',
    lastCheckStatus: 'matched',
    postCutoverNativeChanges: false,
    updatedAt: now,
  })
  return 'created'
}

function offeringStatus(row: RuntimeDocument): 'draft' | 'published' | 'paused' | 'retired' {
  const value = stringField(row, 'status'); return value === 'published' || value === 'paused' || value === 'retired' ? value : 'draft'
}
function accessPathStatus(row: RuntimeDocument): 'draft' | 'published' | 'withdrawn' {
  const value = stringField(row, 'status'); return value === 'published' || value === 'withdrawn' ? value : 'draft'
}

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

/** Authenticated source read for the protected owner Offering editor. */
export const getCurrentOwnerOfferingSupply = queryGeneric({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
    const db = runtimeDb(ctx.db)
    const owner = await db.query('owners').withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', actor.clerkUserId)).unique()
    if (owner === null) return { kind: 'not_found' as const }
    const businesses = await db.query('businesses').withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id)).collect()
    const business = businesses.sort((a, b) => numberField(b, 'updatedAt') - numberField(a, 'updatedAt')).at(0)
    if (business === undefined) return { kind: 'not_found' as const }
    const state = await loadOfferingSourceState(db, business._id, actor.clerkUserId)
    const cutover = await db.query('catalogSupplyCutovers').withIndex('by_businessId', (q) => q.eq('businessId', business._id)).unique()
    const snapshot = await db.query('businessSupplyProjectionSnapshots').withIndex('by_businessId', (q) => q.eq('businessId', business._id)).unique()
    return {
      kind: 'available' as const,
      businessId: business._id,
      business: { name: stringField(business, 'name'), slug: stringField(business, 'slug'), publicStatus: stringField(business, 'publicStatus'), publishedPhone: optionalStringField(business, 'publishedPhone') },
      offerings: state.offerings.map((offering) => ({
        ...offering,
        revision: state.revisions.find((revision) => revision.offeringRef === offering.offeringRef && revision.revision === offering.currentRevision),
        accessPaths: state.accessPaths.filter((path) => path.offeringRef === offering.offeringRef),
      })),
      cutover: cutover === null ? { mode: 'offering', lastCheckStatus: 'not_run', postCutoverNativeChanges: false } : {
        mode: stringField(cutover, 'mode'), lastCheckStatus: stringField(cutover, 'lastCheckStatus'), postCutoverNativeChanges: Boolean(cutover.postCutoverNativeChanges),
      },
      projection: snapshot === null ? { status: 'projection_pending' } : {
        status: stringField(snapshot, 'status'), observedAt: numberField(snapshot, 'observedAt'), disposition: stringField(snapshot, 'disposition'), lastErrorCode: optionalStringField(snapshot, 'lastErrorCode'),
      },
    }
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
  publishedPhone?: string
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
  const nextSlugs = new Set<string>()
  const persisted: PersistedService[] = []
  for (const [sortOrder, service] of services.entries()) {
    const serviceSlug = normalizeSlug(service.name)
    nextSlugs.add(serviceSlug)
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
    if (!nextSlugs.has(stringField(service, 'serviceSlug'))) {
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
  const [capabilities, indexStatus, discoveryStatus] = await Promise.all([
    db
      .query('serviceCapabilities')
      .withIndex('by_business_service_status', (query) => query.eq('businessId', businessId))
      .collect(),
    indexStatusForBusiness(db, businessId),
    discoveryStatusForBusiness(db, businessId, stringField(business, 'sourceHash')),
  ])
  return {
    businessId,
    slug: stringField(business, 'slug'),
    name: stringField(business, 'name'),
    category: stringField(context, 'category'),
    suburb: stringField(context, 'suburb'),
    stateTerritory: stringField(context, 'stateTerritory'),
    ...(optionalStringField(business, 'publishedPhone') === undefined ? {} : { publishedPhone: stringField(business, 'publishedPhone') }),
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
  const serviceCapabilities: PublicCapability[] = []
  for (const capability of capabilities) {
    if (stringField(capability, 'serviceId') === service._id) {
      serviceCapabilities.push(toPublicCapability(capability))
    }
  }
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
  const existing = await findPublishAuditEvent(db, businessId, args.operationKey)
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
): Promise<AuditEvent | undefined> {
  const eventId = `audit:claim.published:${businessId}:${operationKey}`
  const event = await db
    .query('auditEvents')
    .withIndex('by_eventId', (query) => query.eq('eventId', eventId))
    .unique()
  if (
    event === null
    || stringField(event, 'businessId') !== businessId
    || stringField(event, 'idempotencyKey') !== operationKey
    || stringField(event, 'eventType') !== 'claim.published'
  ) {
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
    ...(optionalStringField(business, 'publishedPhone') === undefined
      ? {}
      : { publishedPhone: stringField(business, 'publishedPhone') }),
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
