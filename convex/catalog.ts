import { mutationGeneric, queryGeneric, type GenericDatabaseReader, type GenericDatabaseWriter } from 'convex/server'
import { v } from 'convex/values'
import { literalUnion } from '../src/modules/common/convex-literals'

import type { MutationCtx } from './_generated/server'
import type { DataModel, Doc, Id } from './_generated/dataModel'

import { brandNonEmpty } from '../src/modules/common/ids'

import { readActiveAdminMembership, resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { hasActiveBusinessSuppression } from './catalogRuntimeQueries'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { requireAdminAuthority } from '../src/modules/security/public'
import { normalizeSlug } from '../src/modules/common/normalize-slug'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './capabilitySupplyProjection'
import { readBusinessSupplyProjectionSnapshot } from './businessSupplyProjectionSnapshot'
export {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './capabilitySupplyProjection'
import {
  BusinessOfferingStatusValues,
  OfferingAccessPathStatusValues,
  changeOfferingStatusInState,
  createOfferingInState,
  MAX_ACCESS_PATHS_PER_OFFERING,
  MAX_OFFERINGS_PER_BUSINESS,
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
  reviseOfferingInState,
  upsertAccessPathInState,
  withdrawAccessPathInState,
  type OfferingAccessPathDescriptor,
  type OfferingAccessPathStatus,
  type OfferingPrice,
  type OfferingSourceResult,
  type OfferingSourceState,
  type BusinessOfferingStatus,
  validateServiceCatalogInput,
} from '../src/modules/catalog/public'
import type {
  BusinessOfferingRevisionRecord,
  OfferingAccessPathRecord,
  OfferingFactsInput,
  ServiceCatalogInput,
  ValidatedServiceCatalogInput,
} from '../src/modules/catalog/public'
import { projectBusinessSupplyToPublicApi } from '../src/modules/registry/public'

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

/** Mirrors `businessOfferingRevisions.price` exactly; optional and additive. */
const offeringPriceArg = v.object({
  kind: literalUnion(OfferingPriceKindValues),
  currency: v.string(),
  amountMinor: v.optional(v.number()),
  maximumAmountMinor: v.optional(v.number()),
  unit: v.optional(literalUnion(OfferingPriceUnitValues)),
  taxTreatment: literalUnion(OfferingPriceTaxTreatmentValues),
})
const offeringFactsArg = v.object({
  name: v.string(), category: v.string(), summary: v.string(),
  serviceAreaSummary: v.optional(v.string()), availabilitySummary: v.optional(v.string()), pricingSummary: v.optional(v.string()),
  price: v.optional(offeringPriceArg),
})
const humanAccessPathArg = v.object({ kind: v.literal('human_request'), channel: v.union(v.literal('phone'), v.literal('website'), v.literal('ae_inquiry')), disclosure: v.string(), url: v.optional(v.string()) })
const externalAccessPathArg = v.object({
  kind: v.literal('external_operation'), name: v.string(), summary: v.string(), url: v.string(), method: v.optional(v.string()),
  documentationUrl: v.optional(v.string()), interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })),
  authenticationSummary: v.optional(v.string()), pricingSummary: v.optional(v.string()),
  provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')),
})
const offeringCommandResult = v.object({ kind: v.union(v.literal('ok'), v.literal('error')), code: v.string(), reason: v.optional(v.string()), resultRef: v.optional(v.string()), currentRevision: v.optional(v.number()) })

const publicOfferingAccessPathResult = v.union(
  v.object({
    accessPathRef: v.string(),
    kind: v.literal('human_request'),
    channel: v.union(v.literal('phone'), v.literal('website'), v.literal('ae_inquiry')),
    disclosure: v.string(),
    url: v.optional(v.string()),
  }),
  v.object({
    accessPathRef: v.string(),
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

const publicOfferingResult = v.object({
  offeringRef: v.string(),
  revision: v.number(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceAreaSummary: v.optional(v.string()),
  availabilitySummary: v.optional(v.string()),
  pricingSummary: v.optional(v.string()),
  price: v.optional(offeringPriceArg),
  accessPaths: v.array(publicOfferingAccessPathResult),
  support: v.object({
    integrated: v.boolean(),
    aeSupportedAction: v.boolean(),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
  }),
})

const publicCatalogV2Result = v.object({
  schemaVersion: v.literal('public-business-catalog-api:v2'),
  businessId: v.string(),
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  publishedPhone: v.optional(v.string()),
  postcode: v.optional(v.string()),
  publicUrl: v.string(),
  trustTier: v.union(v.literal('claimed'), v.literal('contact_confirmed'), v.literal('listed'), v.literal('registry_verified')),
  responseTimeMinutes: v.optional(v.number()),
  photos: v.array(v.object({ url: v.string(), alt: v.string() })),
  observedAt: v.number(),
  disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
  offerings: v.array(publicOfferingResult),
  accessSummary: v.object({
    humanRequest: v.boolean(),
    externalOperation: v.boolean(),
    aeSupportedAction: v.boolean(),
  }),
})

const publicCatalogReadbackResult = v.union(
  v.object({
    kind: v.literal('available'),
    catalog: publicCatalogV2Result,
  }),
  v.object({
    kind: v.literal('not_found'),
    reason: v.union(v.literal('not_public'), v.literal('no_such_business')),
  })
)
function catalogReadNotFound(reason: 'not_public' | 'no_such_business' = 'not_public') {
  return { kind: 'not_found' as const, reason }
}

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
const catalogOfferingPriceValue = v.object({
  kind: v.union(v.literal('fixed'), v.literal('from'), v.literal('range'), v.literal('quote_only')),
  currency: v.string(),
  amountMinor: v.optional(v.number()),
  maximumAmountMinor: v.optional(v.number()),
  unit: v.optional(v.union(
    v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'),
    v.literal('day'), v.literal('week'), v.literal('month'),
  )),
  taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
})
const catalogAccessPathDescriptorValue = v.union(
  humanAccessPathArg,
  externalAccessPathArg,
)
const catalogOwnerSupplyResult = v.union(
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    businessId: v.string(),
    business: v.object({
      name: v.string(),
      slug: v.string(),
      publicStatus: v.union(v.literal('unpublished'), v.literal('published'), v.literal('suppressed')),
      publishedPhone: v.optional(v.string()),
    }),
    offerings: v.array(v.object({
      offeringRef: v.string(),
      businessId: v.string(),
      currentRevision: v.number(),
      status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')),
      createdAt: v.number(),
      updatedAt: v.number(),
      revision: v.optional(v.object({
        offeringRef: v.string(),
        businessId: v.string(),
        revision: v.number(),
        name: v.string(),
        category: v.string(),
        summary: v.string(),
        serviceAreaSummary: v.optional(v.string()),
        availabilitySummary: v.optional(v.string()),
        pricingSummary: v.optional(v.string()),
        price: v.optional(catalogOfferingPriceValue),
        sourceHash: v.string(),
        createdAt: v.number(),
      })),
      accessPaths: v.array(v.object({
        accessPathRef: v.string(),
        businessId: v.string(),
        offeringRef: v.string(),
        offeringRevision: v.number(),
        offeringSourceHash: v.string(),
        status: v.union(v.literal('draft'), v.literal('published'), v.literal('withdrawn')),
        descriptor: catalogAccessPathDescriptorValue,
        sourceHash: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
      })),
    })),
    projection: v.union(
      v.object({ status: v.literal('projection_pending') }),
      v.object({
        status: v.union(v.literal('current'), v.literal('projection_pending')),
        observedAt: v.number(),
        disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
        lastErrorCode: v.optional(v.string()),
      }),
    ),
  }),
)
const catalogProjectionRetryResult = v.union(
  v.object({ kind: v.literal('ok'), sourceDigest: v.string() }),
  v.object({ kind: v.literal('error'), code: v.string(), reason: v.optional(v.string()) }),
)

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
  catalog: publicCatalogV2Result,
  auditEvent: auditEventResult,
  registryProjectionAttempts: v.array(registryAttemptResult),
  discoveryManifestAttempts: v.array(discoveryAttemptResult),
})

export const publishBusinessCatalog = mutationGeneric({
  args: {
    claimId: v.id('claims'),
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

    return publishBusinessCatalogCommand(ctx.db, {
      actor,
      claimId: args.claimId,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      services: args.services,
    }, Date.now())
  },
})

export async function publishBusinessCatalogCommand(
  db: GenericDatabaseWriter<DataModel>,
  command: {
    actor: { kind: 'authenticated_owner'; clerkUserId: string }
    claimId: Id<'claims'>
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

  if (claim.status === 'contested' || claim.status === 'disputed') {
    return catalogError('catalog_publish_pending_review', 'Claim must finish review before publishing.')
  }

  const businessId = claim.businessId
  if (businessId === undefined) {
    return catalogError('catalog_publish_claim_not_found', 'Claim source state is incomplete.')
  }

  const owner = await db.get(claim.ownerId)
  if (owner === null || owner.clerkUserId !== command.actor.clerkUserId) {
    return catalogError('catalog_publish_wrong_owner', 'Only the source-bound owner can publish this catalog.')
  }

  const [business, context] = await Promise.all([
    db.get(businessId),
    db.query('businessContexts').withIndex('by_business', (query) => query.eq('businessId', businessId)).unique(),
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

  const requestHash = canonicalDigest({
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
      query.eq('actorRef', claim.ownerId).eq('operationName', 'publishBusinessCatalog').eq('key', command.operationKey)
    )
    .unique()
  if (existingOperation !== null) {
    if (existingOperation.requestHash !== requestHash || existingOperation.status !== 'succeeded') {
      return catalogError('catalog_publish_operation_conflict', 'Operation key is already reserved for a different publish request.')
    }
    const replayCatalog = await publicCatalogForBusiness(db, businessId)
    if (existingOperation.sourceHash !== business.sourceHash) {
      return catalogError('catalog_publish_operation_conflict', 'Published operation source no longer matches this business.')
    }
    const replayAudit = await findPublishAuditEvent(db, businessId, command.operationKey)
    if (replayCatalog === undefined || replayAudit === undefined) {
      return catalogError('catalog_publish_operation_conflict', 'Published operation readback is incomplete.')
    }
    const replayBusiness = publishedBusinessContract(businessId, business, existingOperation.updatedAt)
    const replayClaim = publishedClaimContract(command.claimId, claim, businessId, existingOperation.updatedAt)
    return {
      kind: 'ok' as const,
      code: 'catalog_publish_replayed' as const,
      business: replayBusiness,
      claim: replayClaim,
      catalog: replayCatalog,
      auditEvent: replayAudit,
      registryProjectionAttempts: await registryAttemptsForBusiness(db, businessId, business.sourceHash),
      discoveryManifestAttempts: await discoveryAttemptsForBusiness(db, businessId, business.sourceHash),
    }
  }

  const operationId = await db.insert('operationKeys', {
    scope: 'catalog',
    actorKind: 'owner',
    actorRef: claim.ownerId,
    operationName: 'publishBusinessCatalog',
    key: command.operationKey,
    requestHash,
    sourceHash: business.sourceHash,
    status: 'in_progress',
    effectRefs: [],
    createdAt: now,
    updatedAt: now,
  })
  await Promise.all([
    db.patch(businessId, {
      publicStatus: 'published',
      claimStatus: 'published',
      updatedAt: now,
    }),
    db.patch(command.claimId, {
      status: 'published',
      updatedAt: now,
    }),
  ])
  const persistedOfferings = await persistPublishedOfferings(db, businessId, owner.clerkUserId, validation.services, command.operationKey, now)
  if (persistedOfferings.kind === 'error') {
    return catalogError('catalog_publish_invalid_services', `offering_${persistedOfferings.code}`)
  }
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(db, businessId, now)
  const rebuilt = await rebuildBusinessSupplyProjectionSnapshotCommand({
    db,
    sourceDb: db,
    businessId,
    support,
    now,
  })
  if (rebuilt.kind === 'error') {
    return catalogError('catalog_publish_invalid_services', `offering_projection_${rebuilt.code}`)
  }
  const catalog = await publicCatalogForBusiness(db, businessId)
  if (catalog === undefined) {
    return catalogError('catalog_publish_invalid_services', 'no_published_offerings')
  }

  const auditEvent = await ensurePublishAuditEvent(db, businessId, claim.ownerId, business.slug, command, now)
  const registryAttempts = await ensureRegistryAttempts(db, businessId, business.sourceHash, now)
  const discoveryAttempts = await ensureDiscoveryAttempt(db, businessId, business.sourceHash, now)
  await upsertBusinessIndexStatus(db, businessId, business.sourceHash, now)
  await db.patch(operationId, {
    status: 'succeeded',
    resultHash: canonicalDigest({ auditEventId: auditEvent.eventId, businessId, slug: business.slug }),
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


export async function ensureCatalogProjectionControlsCommand(
  db: GenericDatabaseWriter<DataModel>,
  command: Readonly<{
    actorRef: string
    operationKey: string
    correlationId: string
    reasonCode: string
    evidenceRefs: readonly string[]
  }>,
  now: number,
): Promise<void> {
  for (const key of ['offering_public_projection_enabled', 'offering_authoring_enabled'] as const) {
    const existing = await db.query('operatorControls').withIndex('by_key', (query) => query.eq('key', key)).unique()
    if (existing === null) {
      await db.insert('operatorControls', {
        key,
        enabled: true,
        changedByAdminRef: command.actorRef,
        reasonCode: command.reasonCode,
        evidenceRefs: [...command.evidenceRefs],
        correlationId: command.correlationId,
        operationKey: `${command.operationKey}:${key}`,
        updatedAt: now,
      })
    } else if (!existing.enabled) {
      await db.patch(existing._id, {
        enabled: true,
        changedByAdminRef: command.actorRef,
        reasonCode: command.reasonCode,
        evidenceRefs: [...command.evidenceRefs],
        correlationId: command.correlationId,
        operationKey: `${command.operationKey}:${key}`,
        updatedAt: now,
      })
    }
  }
}
export async function createBusinessOfferingCommand(
  db: GenericDatabaseWriter<DataModel>,
  command: Readonly<{
    actorRef: string
    businessId: Id<'businesses'>
    offeringRef: string
    operationKey: string
    facts: OfferingFactsInput
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(db, { ...command, operationName: 'createOffering' }, (state, authority) => createOfferingInState(state, {
    authority,
    operationKey: command.operationKey,
    businessId: brandNonEmpty(command.businessId, 'BusinessId'),
    offeringRef: brandNonEmpty(command.offeringRef, 'OfferingRef'),
    facts: command.facts,
    now,
  }), now)
}
export async function changeBusinessOfferingStatusCommand(
  db: GenericDatabaseWriter<DataModel>,
  command: Readonly<{
    actorRef: string
    businessId: Id<'businesses'>
    offeringRef: string
    expectedRevision: number
    operationKey: string
    status: 'draft' | 'published' | 'paused' | 'retired'
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(db, { ...command, operationName: 'changeOfferingStatus' }, (state, authority) => changeOfferingStatusInState(state, {
    authority,
    operationKey: command.operationKey,
    offeringRef: brandNonEmpty(command.offeringRef, 'OfferingRef'),
    expectedRevision: command.expectedRevision,
    status: command.status,
    now,
  }), now)
}
export async function reviseBusinessOfferingCommand(
  db: GenericDatabaseWriter<DataModel>,
  command: Readonly<{
    actorRef: string
    businessId: Id<'businesses'>
    offeringRef: string
    expectedRevision: number
    operationKey: string
    facts: OfferingFactsInput
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(db, { ...command, operationName: 'reviseOffering' }, (state, authority) => reviseOfferingInState(state, {
    authority,
    operationKey: command.operationKey,
    offeringRef: brandNonEmpty(command.offeringRef, 'OfferingRef'),
    expectedRevision: command.expectedRevision,
    facts: command.facts,
    now,
  }), now)
}
export async function upsertOfferingAccessPathCommand(
  db: GenericDatabaseWriter<DataModel>,
  command: Readonly<{
    actorRef: string
    businessId: Id<'businesses'>
    offeringRef: string
    accessPathRef: string
    expectedRevision: number
    operationKey: string
    descriptor: OfferingAccessPathDescriptor
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(db, { ...command, operationName: 'upsertAccessPath' }, (state, authority) => upsertAccessPathInState(state, {
    authority,
    operationKey: command.operationKey,
    offeringRef: brandNonEmpty(command.offeringRef, 'OfferingRef'),
    accessPathRef: brandNonEmpty(command.accessPathRef, 'AccessPathRef'),
    expectedRevision: command.expectedRevision,
    status: 'published',
    descriptor: command.descriptor,
    now,
  }), now)
}
export async function withdrawOfferingAccessPathCommand(
  db: GenericDatabaseWriter<DataModel>,
  command: Readonly<{
    actorRef: string
    businessId: Id<'businesses'>
    accessPathRef: string
    expectedRevision: number
    operationKey: string
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(db, { ...command, operationName: 'withdrawAccessPath' }, (state, authority) => withdrawAccessPathInState(state, {
    authority,
    operationKey: command.operationKey,
    accessPathRef: brandNonEmpty(command.accessPathRef, 'AccessPathRef'),
    expectedRevision: command.expectedRevision,
    now,
  }), now)
}

type SystemOfferingCommand = Readonly<{
  actorRef: string
  businessId: Id<'businesses'>
  operationName: string
  operationKey: string
}>
async function runSystemOfferingSourceCommand(
  db: GenericDatabaseWriter<DataModel>,
  command: SystemOfferingCommand,
  mutate: (
    state: OfferingSourceState,
    authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string },
  ) => OfferingSourceResult<unknown>,
  now: number,
): Promise<{ kind: 'ok'; code: string; resultRef?: string; currentRevision?: number } | { kind: 'error'; code: string; reason: string }> {
  const business = await db.get(command.businessId)
  if (business === null) return { kind: 'error', code: 'not_found', reason: 'Business was not found.' }
  const owner = await db.get(business.ownerId)
  const ownerRef = owner?.clerkUserId ?? ''
  if (ownerRef.length === 0 || command.actorRef !== ownerRef) {
    return { kind: 'error', code: 'wrong_owner', reason: 'Only the source-bound owner may change this business.' }
  }
  const state = await loadOfferingSourceState(db, command.businessId, {
    actorRef: ownerRef,
    operationName: command.operationName,
    operationKey: command.operationKey,
  })
  const result = mutate(state, { actorRef: command.actorRef, ownerRef, businessOwnerRef: ownerRef })
  if (result.kind === 'error') return { kind: 'error', code: result.code, reason: result.reason }
  const persisted = await persistOfferingSourceState(db, command.businessId, state, result.state)
  if (persisted.kind === 'error') return persisted
  const value = result.value
  const resultRef = typeof value === 'object' && value !== null
    ? ('offeringRef' in value && typeof value.offeringRef === 'string'
      ? value.offeringRef
      : 'accessPathRef' in value && typeof value.accessPathRef === 'string' ? value.accessPathRef : undefined)
    : undefined
  const currentRevision = typeof value === 'object' && value !== null && 'currentRevision' in value && typeof value.currentRevision === 'number'
    ? value.currentRevision
    : undefined
  return { kind: 'ok', code: result.code, ...(resultRef === undefined ? {} : { resultRef }), ...(currentRevision === undefined ? {} : { currentRevision }) }
}

export const createBusinessOffering = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs, facts: offeringFactsArg },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, 'createOffering', (state, authority, now) => createOfferingInState(state, {
    authority,
    operationKey: args.operationKey,
    businessId: brandNonEmpty(args.businessId, 'BusinessId'),
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    facts: args.facts,
    now,
  })),
})

export const reviseBusinessOffering = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), ...sourceWriteArgs, facts: offeringFactsArg },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, 'reviseOffering', (state, authority, now) => reviseOfferingInState(state, {
    authority,
    operationKey: args.operationKey,
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    expectedRevision: args.expectedRevision,
    facts: args.facts,
    now,
  })),
})

export const changeBusinessOfferingStatus = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')), ...sourceWriteArgs },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, 'changeOfferingStatus', (state, authority, now) => changeOfferingStatusInState(state, {
    authority,
    operationKey: args.operationKey,
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    expectedRevision: args.expectedRevision,
    status: args.status,
    now,
  })),
})

export const upsertOfferingAccessPath = mutationGeneric({
  args: { businessId: v.id('businesses'), offeringRef: v.string(), accessPathRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), status: v.union(v.literal('draft'), v.literal('published')), descriptor: v.union(humanAccessPathArg, externalAccessPathArg), ...sourceWriteArgs },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, 'upsertAccessPath', (state, authority, now) => upsertAccessPathInState(state, {
    authority,
    operationKey: args.operationKey,
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    accessPathRef: brandNonEmpty(args.accessPathRef, 'AccessPathRef'),
    expectedRevision: args.expectedRevision,
    status: args.status,
    descriptor: args.descriptor,
    now,
  })),
})

export const withdrawOfferingAccessPath = mutationGeneric({
  args: { businessId: v.id('businesses'), accessPathRef: v.string(), operationKey: v.string(), correlationId: v.string(), expectedRevision: v.number(), ...sourceWriteArgs },
  returns: offeringCommandResult,
  handler: async (ctx, args) => runOfferingSourceMutation(ctx, args, 'withdrawAccessPath', (state, authority, now) => withdrawAccessPathInState(state, {
    authority,
    operationKey: args.operationKey,
    accessPathRef: brandNonEmpty(args.accessPathRef, 'AccessPathRef'),
    expectedRevision: args.expectedRevision,
    now,
  })),
})

async function runOfferingSourceMutation(
  ctx: MutationCtx,
  args: { businessId: Id<'businesses'>; operationKey: string; correlationId: string; sourceWrite?: unknown },
  operationName: string,
  mutate: (state: OfferingSourceState, authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string }, now: number) => OfferingSourceResult<unknown>,
): Promise<{ kind: 'ok'; code: string; resultRef?: string; currentRevision?: number } | { kind: 'error'; code: string; reason: string }> {
  const admitted = await requireSourceWrite(ctx, args, 'catalog_publish')
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'error', code: 'unauthenticated', reason: 'Authentication is required.' }
  const now = Date.now()
  const operatorControl = await ctx.db
    .query('operatorControls')
    .withIndex('by_key', (query) => query.eq('key', 'offering_authoring_enabled'))
    .unique()
  if (
    operatorControl === null
    || operatorControl.enabled !== true
    || (operatorControl.expiresAt !== undefined && operatorControl.expiresAt <= now)
  ) {
    return { kind: 'error', code: 'operation_conflict', reason: 'Offering authoring is currently disabled.' }
  }
  const business = await ctx.db.get(args.businessId)
  if (business === null) return { kind: 'error', code: 'wrong_owner', reason: 'Business was not found.' }
  const owner = await ctx.db.get(business.ownerId)
  const businessOwnerRef = owner?.clerkUserId ?? ''
  const state = await loadOfferingSourceState(ctx.db, args.businessId, {
    actorRef: businessOwnerRef,
    operationName,
    operationKey: args.operationKey,
  })
  const result = mutate(state, { actorRef: actor.clerkUserId, ownerRef: businessOwnerRef, businessOwnerRef }, now)
  if (result.kind === 'error') return { kind: 'error', code: result.code, reason: result.reason }
  const persisted = await persistOfferingSourceState(ctx.db, args.businessId, state, result.state)
  if (persisted.kind === 'error') return persisted
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, args.businessId, now)
  await rebuildBusinessSupplyProjectionSnapshotCommand({ db: ctx.db, sourceDb: ctx.db, businessId: args.businessId, support, now })
  const value = result.value
  const resultRef = typeof value === 'object' && value !== null
    ? ('offeringRef' in value && typeof value.offeringRef === 'string'
      ? value.offeringRef
      : 'accessPathRef' in value && typeof value.accessPathRef === 'string' ? value.accessPathRef : undefined)
    : undefined
  const currentRevision = typeof value === 'object' && value !== null && 'currentRevision' in value && typeof value.currentRevision === 'number'
    ? value.currentRevision
    : undefined
  return { kind: 'ok', code: result.code, ...(resultRef === undefined ? {} : { resultRef }), ...(currentRevision === undefined ? {} : { currentRevision }) }
}

export const retryBusinessSupplyProjection = mutationGeneric({
  args: { businessId: v.id('businesses') },
  returns: catalogProjectionRetryResult,
  handler: async (ctx, args) => {
    const now = Date.now()
    const db = await requireCatalogSupplyAdmin(ctx)
    if ('kind' in db) return db
    const support = await deriveBusinessOfferingSupportFromCapabilitySupply(db, args.businessId, now)
    return rebuildBusinessSupplyProjectionSnapshotCommand({ db, sourceDb: db, businessId: args.businessId, support, now })
  },
})

async function requireCatalogSupplyAdmin(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  const membership = identity === null ? undefined : await readActiveAdminMembership(ctx.db, identity)
  const authority = requireAdminAuthority(membership, 'set_operator_control')
  return authority.kind === 'allowed' ? ctx.db : { kind: 'error' as const, code: 'admin_denied' as const, reason: authority.reason }
}


function isCatalogRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}


type CatalogStringKey<Row extends object> = Extract<keyof Row, string>


function requiredCatalogString<Row extends object>(row: Row, field: CatalogStringKey<Row>): string {
  const value = row[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`catalog_invalid_${field}`)
  }
  return value
}

function requiredCatalogNumber<Row extends object>(row: Row, field: CatalogStringKey<Row>): number {
  const value = row[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`catalog_invalid_${field}`)
  }
  return value
}

function optionalCatalogString<Row extends object>(row: Row, field: CatalogStringKey<Row>): string | undefined {
  const value = row[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`catalog_invalid_${field}`)
  return value
}

function optionalCatalogNumber<Row extends object>(row: Row, field: CatalogStringKey<Row>): number | undefined {
  const value = row[field]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`catalog_invalid_${field}`)
  return value
}

function requiredCatalogLiteral<T extends string>(
  values: readonly T[],
  value: unknown,
  field: string,
): T {
  const match = values.find((candidate) => candidate === value)
  if (match === undefined) throw new Error(`catalog_invalid_${field}`)
  return match
}

function readCatalogPrice(value: unknown): OfferingPrice | undefined {
  if (value === undefined) return undefined
  if (!isCatalogRecord(value)) throw new Error('catalog_invalid_price')
  const amountMinor = optionalCatalogNumber(value, 'amountMinor')
  const maximumAmountMinor = optionalCatalogNumber(value, 'maximumAmountMinor')
  const unit = value.unit === undefined
    ? undefined
    : requiredCatalogLiteral(OfferingPriceUnitValues, value.unit, 'price_unit')
  return {
    kind: requiredCatalogLiteral(OfferingPriceKindValues, value.kind, 'price_kind'),
    currency: requiredCatalogString(value, 'currency'),
    ...(amountMinor === undefined ? {} : { amountMinor }),
    ...(maximumAmountMinor === undefined ? {} : { maximumAmountMinor }),
    ...(unit === undefined ? {} : { unit }),
    taxTreatment: requiredCatalogLiteral(OfferingPriceTaxTreatmentValues, value.taxTreatment, 'price_taxTreatment'),
  }
}

export function readCatalogDescriptor(value: unknown): OfferingAccessPathDescriptor {
  if (!isCatalogRecord(value)) throw new Error('catalog_invalid_descriptor')
  const kind = value.kind
  if (kind === 'human_request') {
    const url = optionalCatalogString(value, 'url')
    return {
      kind,
      channel: requiredCatalogLiteral(['phone', 'website', 'ae_inquiry'], value.channel, 'access_path_channel'),
      disclosure: requiredCatalogString(value, 'disclosure'),
      ...(url === undefined ? {} : { url }),
    }
  }
  if (kind === 'external_operation') {
    const method = optionalCatalogString(value, 'method')
    const documentationUrl = optionalCatalogString(value, 'documentationUrl')
    const authenticationSummary = optionalCatalogString(value, 'authenticationSummary')
    const pricingSummary = optionalCatalogString(value, 'pricingSummary')
    const interfaceDescriptionValue = value.interfaceDescription
    const interfaceDescription = interfaceDescriptionValue === undefined
      ? undefined
      : (() => {
          if (!isCatalogRecord(interfaceDescriptionValue)) throw new Error('catalog_invalid_interface_description')
          const url = optionalCatalogString(interfaceDescriptionValue, 'url')
          return {
            format: requiredCatalogString(interfaceDescriptionValue, 'format'),
            ...(url === undefined ? {} : { url }),
          }
        })()
    return {
      kind,
      name: requiredCatalogString(value, 'name'),
      summary: requiredCatalogString(value, 'summary'),
      url: requiredCatalogString(value, 'url'),
      ...(method === undefined ? {} : { method }),
      ...(documentationUrl === undefined ? {} : { documentationUrl }),
      ...(interfaceDescription === undefined ? {} : { interfaceDescription }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      provenance: requiredCatalogLiteral(['business_declared', 'publicly_observed'], value.provenance, 'access_path_provenance'),
    }
  }
  throw new Error('catalog_invalid_descriptor_kind')
}

function readCatalogStatus(value: unknown): BusinessOfferingStatus {
  return requiredCatalogLiteral(BusinessOfferingStatusValues, value, 'offering_status')
}

function readCatalogAccessPathStatus(value: unknown): OfferingAccessPathStatus {
  return requiredCatalogLiteral(OfferingAccessPathStatusValues, value, 'access_path_status')
}

function readCatalogRevision(row: Doc<'businessOfferingRevisions'>): BusinessOfferingRevisionRecord {
  const serviceAreaSummary = optionalCatalogString(row, 'serviceAreaSummary')
  const availabilitySummary = optionalCatalogString(row, 'availabilitySummary')
  const pricingSummary = optionalCatalogString(row, 'pricingSummary')
  const price = readCatalogPrice(row.price)
  return {
    offeringRef: brandNonEmpty(requiredCatalogString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredCatalogString(row, 'businessId'), 'BusinessId'),
    revision: requiredCatalogNumber(row, 'revision'),
    name: requiredCatalogString(row, 'name'),
    category: requiredCatalogString(row, 'category'),
    summary: requiredCatalogString(row, 'summary'),
    ...(serviceAreaSummary === undefined ? {} : { serviceAreaSummary }),
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    ...(pricingSummary === undefined ? {} : { pricingSummary }),
    ...(price === undefined ? {} : { price }),
    sourceHash: brandNonEmpty(requiredCatalogString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredCatalogNumber(row, 'createdAt'),
  }
}

function readCatalogAccessPath(row: Doc<'offeringAccessPaths'>): OfferingAccessPathRecord {
  return {
    accessPathRef: brandNonEmpty(requiredCatalogString(row, 'accessPathRef'), 'AccessPathRef'),
    businessId: brandNonEmpty(requiredCatalogString(row, 'businessId'), 'BusinessId'),
    offeringRef: brandNonEmpty(requiredCatalogString(row, 'offeringRef'), 'OfferingRef'),
    offeringRevision: requiredCatalogNumber(row, 'offeringRevision'),
    offeringSourceHash: brandNonEmpty(requiredCatalogString(row, 'offeringSourceHash'), 'SourceHash'),
    status: readCatalogAccessPathStatus(row.status),
    descriptor: readCatalogDescriptor(row.descriptor),
    sourceHash: brandNonEmpty(requiredCatalogString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredCatalogNumber(row, 'createdAt'),
    updatedAt: requiredCatalogNumber(row, 'updatedAt'),
  }
}

async function loadOfferingSourceState(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  operation?: Readonly<{ actorRef: string; operationName: string; operationKey: string }>,
): Promise<OfferingSourceState> {
  const offeringRows = await db.query('businessOfferings').withIndex('by_businessId_and_status', (query) => query.eq('businessId', businessId)).take(MAX_OFFERINGS_PER_BUSINESS + 1)
  if (offeringRows.length > MAX_OFFERINGS_PER_BUSINESS) {
    throw new Error('business_offering_capacity_exceeded')
  }
  const offerings = offeringRows.map((row) => ({
    offeringRef: brandNonEmpty(requiredCatalogString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredCatalogString(row, 'businessId'), 'BusinessId'),
    currentRevision: requiredCatalogNumber(row, 'currentRevision'),
    status: readCatalogStatus(row.status),
    createdAt: requiredCatalogNumber(row, 'createdAt'),
    updatedAt: requiredCatalogNumber(row, 'updatedAt'),
  }))
  const revisionRows = await Promise.all(offerings.map((offering) => (
    db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
      ))
      .unique()
  )))
  const pathRows = await Promise.all(offerings.map((offering) => (
    db.query('offeringAccessPaths')
      .withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offering.offeringRef))
      .take(MAX_ACCESS_PATHS_PER_OFFERING + 1)
  )))
  if (pathRows.some((rows) => rows.length > MAX_ACCESS_PATHS_PER_OFFERING)) {
    throw new Error('offering_access_path_capacity_exceeded')
  }
  const operationRow = operation === undefined
    ? null
    : await db.query('operationKeys')
      .withIndex('by_actor_operation_key', (query) => (
        query.eq('actorRef', operation.actorRef)
          .eq('operationName', operation.operationName)
          .eq('key', operation.operationKey)
      ))
      .unique()
  const operationRefs = operationRow === null || operationRow.scope !== 'catalog_offering'
    ? []
    : (() => {
        const value = operationRow.effectRefs
        if (!Array.isArray(value) || value.some((ref) => typeof ref !== 'string')) {
          throw new Error('catalog_invalid_operation_effect_refs')
        }
        return value
      })()
  return {
    offerings,
    revisions: revisionRows.flatMap((row) => row === null ? [] : [readCatalogRevision(row)]),
    accessPaths: pathRows.flat().map(readCatalogAccessPath),
    operations: operationRefs[0] === undefined || operationRow === null
      ? []
      : [{
          actorRef: requiredCatalogString(operationRow, 'actorRef'),
          operationName: requiredCatalogString(operationRow, 'operationName'),
          operationKey: requiredCatalogString(operationRow, 'key'),
          requestHash: brandNonEmpty(requiredCatalogString(operationRow, 'requestHash'), 'SourceHash'),
          resultRef: operationRefs[0],
        }],
  }
}


export async function persistOfferingSourceState(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  before: OfferingSourceState,
  after: OfferingSourceState,
): Promise<{ kind: 'ok' } | { kind: 'error'; code: 'operation_conflict'; reason: string }> {
  // Preflight the entire write set before the first patch/insert. Domain refs are globally
  // addressable, but an owner command may never capture another business's ref.
  for (const item of after.offerings) {
    const existing = await db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', item.offeringRef))
      .unique()
    if (existing !== null && requiredCatalogString(existing, 'businessId') !== businessId) {
      return { kind: 'error', code: 'operation_conflict', reason: 'Offering reference belongs to another business.' }
    }
  }
  for (const item of after.accessPaths) {
    const existing = await db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', item.accessPathRef))
      .unique()
    if (existing !== null && requiredCatalogString(existing, 'businessId') !== businessId) {
      return { kind: 'error', code: 'operation_conflict', reason: 'Access path reference belongs to another business.' }
    }
  }
  for (const item of after.offerings) {
    const existing = await db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', item.offeringRef))
      .unique()
    const value = {
      offeringRef: item.offeringRef,
      businessId,
      currentRevision: item.currentRevision,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }
    if (existing === null) await db.insert('businessOfferings', value)
    else await db.patch(existing._id, value)
  }
  for (const revision of after.revisions.slice(before.revisions.length)) {
    const value = {
      offeringRef: revision.offeringRef,
      businessId,
      revision: revision.revision,
      name: revision.name,
      category: revision.category,
      summary: revision.summary,
      ...(revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: revision.serviceAreaSummary }),
      ...(revision.availabilitySummary === undefined ? {} : { availabilitySummary: revision.availabilitySummary }),
      ...(revision.pricingSummary === undefined ? {} : { pricingSummary: revision.pricingSummary }),
      ...(revision.price === undefined ? {} : { price: revision.price }),
      sourceHash: revision.sourceHash,
      createdAt: revision.createdAt,
    }
    await db.insert('businessOfferingRevisions', value)
  }
  for (const item of after.accessPaths) {
    const existing = await db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', item.accessPathRef))
      .unique()
    const value = {
      accessPathRef: item.accessPathRef,
      businessId,
      offeringRef: item.offeringRef,
      offeringRevision: item.offeringRevision,
      offeringSourceHash: item.offeringSourceHash,
      status: item.status,
      descriptor: item.descriptor,
      sourceHash: item.sourceHash,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }
    if (existing === null) await db.insert('offeringAccessPaths', value)
    else await db.patch(existing._id, value)
  }
  for (const operation of after.operations.slice(before.operations.length)) {
    await db.insert('operationKeys', {
      scope: 'catalog_offering',
      actorKind: 'owner',
      actorRef: operation.actorRef,
      operationName: operation.operationName,
      key: operation.operationKey,
      requestHash: operation.requestHash,
      status: 'succeeded',
      effectRefs: [operation.resultRef],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }
  return { kind: 'ok' }
}

export const getPublicBusinessCatalogBySlug = queryGeneric({
  args: {
    slug: v.string(),
  },
  returns: publicCatalogReadbackResult,
  handler: async (ctx, args) => {
    const business = await ctx.db
      .query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', normalizeSlug(args.slug) || 'service'))
      .unique()
    if (business === null) {
      return catalogReadNotFound('no_such_business')
    }

    const catalog = await publicCatalogForBusiness(ctx.db, business._id)
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

    const owner = await ctx.db
      .query('owners')
      .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
      .unique()
    if (owner === null) {
      return catalogReadNotFound()
    }

    const latestClaims = await ctx.db
      .query('claims')
      .withIndex('by_owner_status', (query) => query.eq('ownerId', owner._id))
      .order('desc')
      .take(20)
    const latestClaim = latestClaims.find((claim) => claim.status === 'published')
    if (latestClaim === undefined || latestClaim.businessId === undefined) {
      return catalogReadNotFound()
    }
    const catalog = await publicCatalogForBusiness(ctx.db, latestClaim.businessId)
    return catalog === undefined ? catalogReadNotFound() : { kind: 'available' as const, catalog }
  },
})

/** Authenticated source read for the protected owner Offering editor. */
export const getCurrentOwnerOfferingSupply = queryGeneric({
  args: {},
  returns: catalogOwnerSupplyResult,
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
    const owner = await ctx.db.query('owners').withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId)).unique()
    if (owner === null) return { kind: 'not_found' as const }
    const business = await ctx.db
      .query('businesses')
      .withIndex('by_owner_updatedAt', (query) => query.eq('ownerId', owner._id))
      .order('desc')
      .first()
    if (business === null) return { kind: 'not_found' as const }
    const state = await loadOfferingSourceState(ctx.db, business._id)
    const snapshot = await ctx.db.query('businessSupplyProjectionSnapshots').withIndex('by_businessId', (query) => query.eq('businessId', business._id)).unique()
    const projection = snapshot === null || snapshot.projection === undefined
      ? { status: 'projection_pending' as const }
      : {
          status: snapshot.status,
          observedAt: snapshot.observedAt,
          disposition: snapshot.disposition,
          ...(snapshot.lastErrorCode === undefined ? {} : { lastErrorCode: snapshot.lastErrorCode }),
        }
    const offerings = state.offerings.map((offering) => {
      const revision = state.revisions.find((candidate) => candidate.offeringRef === offering.offeringRef && candidate.revision === offering.currentRevision)
      return {
        ...offering,
        ...(revision === undefined ? {} : { revision }),
        accessPaths: state.accessPaths.filter((path) => path.offeringRef === offering.offeringRef),
      }
    })
    return {
      kind: 'available' as const,
      businessId: business._id,
      business: {
        name: business.name,
        slug: business.slug,
        publicStatus: business.publicStatus,
        ...(business.publishedPhone === undefined ? {} : { publishedPhone: business.publishedPhone }),
      },
      offerings,
      projection,
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



type AuditEvent = {
  eventId: string
  eventType: string
  actorKind: string
  actorRef: string
  businessId?: Id<'businesses'>
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
  businessId: Id<'businesses'>
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
  businessId: Id<'businesses'>
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
async function persistPublishedOfferings(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  ownerRef: string,
  services: readonly ValidatedServiceCatalogInput[],
  publishOperationKey: string,
  now: number,
): Promise<{ kind: 'ok' } | { kind: 'error'; code: string }> {
  const before = await loadOfferingSourceState(db, businessId)
  let after = before
  const authority = { actorRef: ownerRef, ownerRef, businessOwnerRef: ownerRef }
  const offeringRefs = new Set<string>()
  for (const service of services) {
    const slug = normalizeSlug(service.name) || 'offering'
    const offeringRef = `offering:${businessId}:${slug}`
    offeringRefs.add(offeringRef)
    const facts: OfferingFactsInput = {
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceAreaSummary: service.serviceArea,
      availabilitySummary: service.hoursOrUnknown,
    }
    let offering = after.offerings.find((candidate) => candidate.offeringRef === offeringRef)
    if (offering === undefined) {
      const created = createOfferingInState(after, {
        authority,
        operationKey: `${publishOperationKey}:offering:${slug}:create`,
        businessId: brandNonEmpty(businessId, 'BusinessId'),
        offeringRef: brandNonEmpty(offeringRef, 'OfferingRef'),
        facts,
        now,
      })
      if (created.kind === 'error') return { kind: 'error', code: created.code }
      after = created.state
      offering = created.value
    } else {
      const revised = reviseOfferingInState(after, {
        authority,
        operationKey: `${publishOperationKey}:offering:${slug}:revise:${offering.currentRevision}`,
        offeringRef: offering.offeringRef,
        expectedRevision: offering.currentRevision,
        facts,
        now,
      })
      if (revised.kind === 'error') return { kind: 'error', code: revised.code }
      after = revised.state
      offering = revised.value
    }
    if (offering.status !== 'published') {
      const published = changeOfferingStatusInState(after, {
        authority,
        operationKey: `${publishOperationKey}:offering:${slug}:publish`,
        offeringRef: offering.offeringRef,
        expectedRevision: offering.currentRevision,
        status: 'published',
        now,
      })
      if (published.kind === 'error') return { kind: 'error', code: published.code }
      after = published.state
      offering = published.value
    }

    const humanChannel = service.firstRequest.publicChannel === 'public_business_contact'
      ? 'phone'
      : service.firstRequest.publicChannel === 'ae_status_only'
        ? 'ae_inquiry'
        : undefined
    const existingPaths = after.accessPaths.filter((path) => path.offeringRef === offering.offeringRef && path.status !== 'withdrawn')
    if (humanChannel !== undefined && service.firstRequest.mode !== 'not_available_yet') {
      const upserted = upsertAccessPathInState(after, {
        authority,
        operationKey: `${publishOperationKey}:offering:${slug}:access-path`,
        offeringRef: offering.offeringRef,
        accessPathRef: brandNonEmpty(`access:${businessId}:${slug}:human`, 'AccessPathRef'),
        expectedRevision: offering.currentRevision,
        status: 'published',
        descriptor: {
          kind: 'human_request',
          channel: humanChannel,
          disclosure: service.firstRequest.publicDisclosure ?? 'Contact the business to begin.',
        },
        now,
      })
      if (upserted.kind === 'error') return { kind: 'error', code: upserted.code }
      after = upserted.state
    } else {
      for (const path of existingPaths) {
        const withdrawn = withdrawAccessPathInState(after, {
          authority,
          operationKey: `${publishOperationKey}:offering:${slug}:withdraw:${path.accessPathRef}`,
          accessPathRef: path.accessPathRef,
          expectedRevision: offering.currentRevision,
          now,
        })
        if (withdrawn.kind === 'error') return { kind: 'error', code: withdrawn.code }
        after = withdrawn.state
      }
    }
  }

  for (const offering of after.offerings) {
    if (offeringRefs.has(offering.offeringRef) || offering.status === 'retired') continue
    const drafted = changeOfferingStatusInState(after, {
      authority,
      operationKey: `${publishOperationKey}:offering:${offering.offeringRef}:draft`,
      offeringRef: offering.offeringRef,
      expectedRevision: offering.currentRevision,
      status: 'draft',
      now,
    })
    if (drafted.kind === 'error') return { kind: 'error', code: drafted.code }
    after = drafted.state
  }
  const persisted = await persistOfferingSourceState(db, businessId, before, after)
  return persisted.kind === 'error' ? persisted : { kind: 'ok' }
}

async function publicCatalogForBusiness(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
) {
  const business = await db.get(businessId)
  if (business === null || business.publicStatus !== 'published') return undefined
  if (await hasActiveBusinessSuppression(db, businessId)) return undefined
  const snapshot = await db
    .query('businessSupplyProjectionSnapshots')
    .withIndex('by_businessId', (query) => query.eq('businessId', businessId))
    .unique()
  if (snapshot === null || snapshot.projection === undefined) return undefined
  const projected = projectBusinessSupplyToPublicApi(readBusinessSupplyProjectionSnapshot(snapshot.projection, 'catalog'))
  const catalog = snapshot.status === 'projection_pending'
    ? { ...projected, disposition: 'stale' as const }
    : projected
  return {
    ...catalog,
    photos: catalog.photos.map((photo) => ({ ...photo })),
    offerings: catalog.offerings.map((offering) => ({
      ...offering,
      ...(offering.price === undefined ? {} : { price: { ...offering.price } }),
      accessPaths: offering.accessPaths.map((path) => ({ ...path })),
      support: { ...offering.support },
    })),
    accessSummary: { ...catalog.accessSummary },
  }
}


async function ensurePublishAuditEvent(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  ownerId: Id<'owners'>,
  slug: string,
  args: { operationKey: string; correlationId: string },
  now: number
): Promise<AuditEvent> {
  const eventId = `audit:claim.published:${businessId}:${args.operationKey}`
  const existing = await findPublishAuditEvent(db, businessId, args.operationKey)
  if (existing !== undefined) return existing
  const redactedPayload = { replayed: false, slug }
  const auditEvent = {
    eventId,
    eventType: 'claim.published' as const,
    actorKind: 'owner' as const,
    actorRef: ownerId,
    businessId,
    slug,
    targetType: 'business' as const,
    targetRef: businessId,
    beforeState: 'authenticated',
    afterState: 'published',
    idempotencyKey: args.operationKey,
    correlationId: args.correlationId,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(redactedPayload),
    payloadHash: canonicalDigest(redactedPayload),
    createdAt: now,
  }
  await db.insert('auditEvents', auditEvent)
  return auditEvent
}

async function findPublishAuditEvent(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  operationKey: string,
): Promise<AuditEvent | undefined> {
  const event = await db
    .query('auditEvents')
    .withIndex('by_eventId', (query) => query.eq('eventId', `audit:claim.published:${businessId}:${operationKey}`))
    .unique()
  if (
    event === null
    || event.businessId !== businessId
    || event.idempotencyKey !== operationKey
    || event.eventType !== 'claim.published'
  ) {
    return undefined
  }
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    actorKind: event.actorKind,
    actorRef: event.actorRef,
    ...(event.businessId === undefined ? {} : { businessId: event.businessId }),
    ...(event.slug === undefined ? {} : { slug: event.slug }),
    targetType: event.targetType,
    targetRef: event.targetRef,
    ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
    ...(event.afterState === undefined ? {} : { afterState: event.afterState }),
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
    evidenceRefs: event.evidenceRefs,
    redactedPayloadJson: event.redactedPayloadJson,
    payloadHash: event.payloadHash,
    createdAt: event.createdAt,
  }
}

async function ensureRegistryAttempts(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  businessSourceHash: string,
  now: number,
): Promise<RegistryAttempt[]> {
  return [await upsertRegistryAttempt(db, {
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
  })]
}

async function upsertRegistryAttempt(db: GenericDatabaseWriter<DataModel>, attempt: RegistryAttempt): Promise<RegistryAttempt> {
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
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
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
  const existing = await db
    .query('discoveryManifestAttempts')
    .withIndex('by_attemptId', (query) => query.eq('attemptId', attempt.attemptId))
    .unique()
  if (existing === null) await db.insert('discoveryManifestAttempts', attempt)
  else await db.patch(existing._id, attempt)
  return [attempt]
}

async function upsertBusinessIndexStatus(db: GenericDatabaseWriter<DataModel>, businessId: Id<'businesses'>, sourceHash: string, now: number): Promise<void> {
  const existing = await db
    .query('indexStatus')
    .withIndex('by_target', (query) => query.eq('targetType', 'business').eq('targetRef', businessId))
    .unique()
  const next = {
    targetType: 'business' as const,
    targetRef: businessId,
    businessId,
    status: 'queued' as const,
    lastAttemptAt: now,
    sourceHash,
    sourceVersion: 'public-catalog:v1' as const,
  }
  if (existing === null) await db.insert('indexStatus', next)
  else await db.patch(existing._id, next)
}

async function registryAttemptsForBusiness(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  businessSourceHash: string,
): Promise<RegistryAttempt[]> {
  const attempt = await db
    .query('registryProjectionAttempts')
    .withIndex('by_logicalKey', (query) => query.eq('logicalKey', `registry:business:${businessId}:${businessSourceHash}`))
    .unique()
  if (attempt === null) return []
  return [{
    businessId: attempt.businessId,
    ...(attempt.offeringRef === undefined ? {} : { serviceId: attempt.offeringRef }),
    logicalKey: attempt.logicalKey,
    projectionKind: attempt.projectionKind,
    sourceHash: attempt.sourceHash,
    sourceVersion: 'public-catalog:v1',
    status: 'queued',
    retryCount: attempt.retryCount,
    startedAt: attempt.startedAt,
    repairAction: 'rebuild_projection',
    repairResult: 'not_run',
  }]
}

async function discoveryAttemptsForBusiness(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  sourceHash: string,
): Promise<DiscoveryAttempt[]> {
  const attempt = await db
    .query('discoveryManifestAttempts')
    .withIndex('by_attemptId', (query) => query.eq('attemptId', `discovery:manifest:${businessId}:${sourceHash}:v1`))
    .unique()
  if (attempt === null) return []
  return [{
    attemptId: attempt.attemptId,
    businessId: attempt.businessId,
    ucpVersion: attempt.ucpVersion,
    pathKind: 'ae_hosted_fallback',
    sourceHash: attempt.sourceHash,
    sourceVersion: 'public-catalog:v1',
    status: 'queued',
    retryCount: attempt.retryCount,
    startedAt: attempt.startedAt,
    repairAction: 'regenerate_manifest',
    repairResult: 'not_run',
  }]
}

function publishedBusinessContract(businessId: Id<'businesses'>, business: Doc<'businesses'>, updatedAt: number) {
  return {
    businessId,
    ownerId: business.ownerId,
    slug: business.slug,
    name: business.name,
    normalizedName: business.normalizedName,
    category: business.category,
    suburb: business.suburb,
    stateTerritory: business.stateTerritory,
    ...(business.publishedPhone === undefined ? {} : { publishedPhone: business.publishedPhone }),
    publicStatus: 'published' as const,
    trustTier: business.trustTier,
    claimStatus: 'published' as const,
    sourceHash: business.sourceHash,
    createdAt: business.createdAt,
    updatedAt,
  }
}

function publishedClaimContract(claimId: Id<'claims'>, claim: Doc<'claims'>, businessId: Id<'businesses'>, updatedAt: number) {
  return {
    claimId,
    ownerId: claim.ownerId,
    businessId,
    slug: claim.slug,
    status: 'published' as const,
    submittedFactsHash: claim.submittedFactsHash,
    createdAt: claim.createdAt,
    updatedAt,
  }
}



export type {
  PublicFirstRequestDisclosure,
  PublishBusinessCatalogCommand,
  PublishBusinessCatalogResult,
} from '../src/modules/catalog/public'
