import type { BusinessRecord } from '../src/modules/business/public'
import type { BusinessServiceRecord, ServiceCapabilityRecord } from '../src/modules/catalog/public'
import type { DevSeedCatalogBundle } from '../src/modules/dev/public'
import type { CapabilityLaunchSupportRecord } from '../src/modules/inquiries/public'
import type { RuntimeDb, RuntimeDocument } from './source_state'

export type DevSeedPersistResult = {
  seededSlugs: readonly string[]
  ownerClerkUserId: string
  ownerId: string
  supportRecordId: string
  businessIdsBySlug: Record<string, string>
}

const DEV_SEED_SUPPORT_RECORD_ID = 'support:dev-seed:human-inquiry-owner-inbox'

export async function persistDevSeedCatalogState(db: RuntimeDb, bundle: DevSeedCatalogBundle): Promise<DevSeedPersistResult> {
  const owner = bundle.state.owners.find((candidate) => candidate.clerkUserId === bundle.ownerClerkUserId)
  if (owner === undefined) {
    throw new Error('Dev seed owner was not found in module state.')
  }

  const ownerId = await upsertOwner(db, owner)
  const businessIdsBySlug: Record<string, string> = {}

  for (const business of bundle.state.businesses) {
    const convexBusinessId = await upsertBusiness(db, ownerId, business)
    businessIdsBySlug[business.slug] = convexBusinessId

    const context = bundle.state.businessContexts.find((candidate) => candidate.businessId === business.businessId)
    if (context === undefined) {
      throw new Error(`Dev seed context missing for ${business.slug}.`)
    }
    await upsertBusinessContext(db, convexBusinessId, context)

    const claim = bundle.state.claims.find((candidate) => candidate.businessId === business.businessId)
    if (claim === undefined) {
      throw new Error(`Dev seed claim missing for ${business.slug}.`)
    }
    const convexClaimId = await upsertClaim(db, ownerId, convexBusinessId, claim)

    for (const fingerprint of bundle.state.claimFingerprints.filter((candidate) => candidate.claimId === claim.claimId)) {
      await upsertClaimFingerprint(db, ownerId, convexBusinessId, convexClaimId, fingerprint)
    }

    const services = bundle.state.businessServices.filter((service) => service.businessId === business.businessId)
    for (const service of services) {
      const convexServiceId = await upsertBusinessService(db, convexBusinessId, service)
      const capability = bundle.state.serviceCapabilities.find(
        (candidate) => candidate.businessId === business.businessId && candidate.serviceId === service.serviceId
      )
      if (capability === undefined) {
        throw new Error(`Dev seed capability missing for ${business.slug}/${service.serviceSlug}.`)
      }
      await upsertServiceCapability(db, convexBusinessId, convexServiceId, capability)
    }
  }

  const primarySlug = bundle.seededSlugs[0]
  const primaryBusinessId = primarySlug === undefined ? undefined : businessIdsBySlug[primarySlug]
  if (primaryBusinessId === undefined) {
    throw new Error('Dev seed primary business id was not resolved.')
  }

  await upsertHumanInquirySupportRecord(db, primaryBusinessId, ownerId, bundle.supportRecord)

  return {
    seededSlugs: bundle.seededSlugs,
    ownerClerkUserId: bundle.ownerClerkUserId,
    ownerId,
    supportRecordId: DEV_SEED_SUPPORT_RECORD_ID,
    businessIdsBySlug,
  }
}

async function upsertOwner(db: RuntimeDb, owner: DevSeedCatalogBundle['state']['owners'][number]): Promise<string> {
  const existing = await db
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', owner.clerkUserId))
    .unique()
  const patch = {
    clerkUserId: owner.clerkUserId,
    ...(owner.displayName === undefined ? {} : { displayName: owner.displayName }),
    ...(owner.emailHash === undefined ? {} : { emailHash: owner.emailHash }),
    updatedAt: owner.updatedAt,
  }

  if (existing === null) {
    return db.insert('owners', { ...patch, createdAt: owner.createdAt })
  }

  await db.patch(existing._id, patch)
  return existing._id
}

async function upsertBusiness(db: RuntimeDb, ownerId: string, business: BusinessRecord): Promise<string> {
  const existing = await db
    .query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', business.slug))
    .unique()
  const patch = {
    ownerId,
    slug: business.slug,
    name: business.name,
    normalizedName: business.normalizedName,
    category: business.category,
    suburb: business.suburb,
    stateTerritory: business.stateTerritory,
    publicStatus: business.publicStatus,
    trustTier: business.trustTier,
    claimStatus: business.claimStatus,
    sourceHash: business.sourceHash,
    updatedAt: business.updatedAt,
    ...(business.suppressedAt === undefined ? {} : { suppressedAt: business.suppressedAt }),
  }

  if (existing === null) {
    return db.insert('businesses', { ...patch, createdAt: business.createdAt })
  }

  await db.patch(existing._id, patch)
  return existing._id
}

async function upsertBusinessContext(
  db: RuntimeDb,
  businessId: string,
  context: DevSeedCatalogBundle['state']['businessContexts'][number]
): Promise<void> {
  const existing = await db
    .query('businessContexts')
    .withIndex('by_business', (query) => query.eq('businessId', businessId))
    .unique()
  const patch = {
    businessId,
    category: context.category,
    suburb: context.suburb,
    stateTerritory: context.stateTerritory,
    ...(context.postcode === undefined ? {} : { postcode: context.postcode }),
    ...(context.ownerMessage === undefined ? {} : { ownerMessage: context.ownerMessage }),
    sourceRefs: context.sourceRefs,
    sourceHash: context.sourceHash,
    approvedAt: context.approvedAt,
  }

  if (existing === null) {
    await db.insert('businessContexts', patch)
    return
  }

  await db.patch(existing._id, patch)
}

async function upsertClaim(
  db: RuntimeDb,
  ownerId: string,
  businessId: string,
  claim: DevSeedCatalogBundle['state']['claims'][number]
): Promise<string> {
  const existing = (await db.query('claims').collect()).find(
    (document) => stringField(document, 'slug') === claim.slug && stringField(document, 'ownerId') === ownerId
  )
  const patch = {
    ownerId,
    businessId,
    slug: claim.slug,
    status: claim.status,
    submittedFactsHash: claim.submittedFactsHash,
    updatedAt: claim.updatedAt,
  }

  if (existing === undefined) {
    return db.insert('claims', { ...patch, createdAt: claim.createdAt })
  }

  await db.patch(existing._id, patch)
  return existing._id
}

async function upsertClaimFingerprint(
  db: RuntimeDb,
  ownerId: string,
  businessId: string,
  claimId: string,
  fingerprint: DevSeedCatalogBundle['state']['claimFingerprints'][number]
): Promise<void> {
  const existing = (await db.query('claimFingerprints').collect()).find(
    (document) =>
      stringField(document, 'fingerprint') === fingerprint.fingerprint && stringField(document, 'status') === fingerprint.status
  )
  const patch = {
    fingerprint: fingerprint.fingerprint,
    status: fingerprint.status,
    businessSlug: fingerprint.businessSlug,
    ownerRef: ownerId,
    claimId,
    updatedAt: fingerprint.updatedAt,
  }

  if (existing === undefined) {
    await db.insert('claimFingerprints', { ...patch, createdAt: fingerprint.createdAt })
    return
  }

  await db.patch(existing._id, patch)
}

async function upsertBusinessService(db: RuntimeDb, businessId: string, service: BusinessServiceRecord): Promise<string> {
  const existing = (await db.query('businessServices').collect()).find(
    (document) => stringField(document, 'businessId') === businessId && stringField(document, 'serviceSlug') === service.serviceSlug
  )
  const patch = {
    businessId,
    serviceSlug: service.serviceSlug,
    name: service.name,
    category: service.category,
    summary: service.summary,
    serviceArea: service.serviceArea,
    hoursOrUnknown: service.hoursOrUnknown,
    status: service.status,
    sortOrder: service.sortOrder,
    sourceHash: service.sourceHash,
    updatedAt: service.updatedAt,
  }

  if (existing === undefined) {
    return db.insert('businessServices', { ...patch, createdAt: service.createdAt })
  }

  await db.patch(existing._id, patch)
  return existing._id
}

async function upsertServiceCapability(
  db: RuntimeDb,
  businessId: string,
  serviceId: string,
  capability: ServiceCapabilityRecord
): Promise<void> {
  const existing = (await db.query('serviceCapabilities').collect()).find(
    (document) =>
      stringField(document, 'businessId') === businessId &&
      stringField(document, 'serviceId') === serviceId &&
      stringField(document, 'kind') === capability.kind
  )
  const patch = {
    businessId,
    serviceId,
    kind: capability.kind,
    status: capability.status,
    firstRequestMode: capability.firstRequest.mode,
    publicDisclosure: capability.firstRequest.publicDisclosure,
    publicChannel: capability.firstRequest.publicChannel,
    ...(capability.firstRequest.mode === 'not_available_yet'
      ? { noContactReason: capability.firstRequest.noContactReason, reason: capability.firstRequest.noContactReason }
      : {}),
    callable: false,
    paymentRequired: false,
    sourceHash: capability.sourceHash,
    updatedAt: capability.updatedAt,
  }

  if (existing === undefined) {
    await db.insert('serviceCapabilities', { ...patch, createdAt: capability.createdAt })
    return
  }

  await db.patch(existing._id, patch)
}

async function upsertHumanInquirySupportRecord(
  db: RuntimeDb,
  businessId: string,
  ownerId: string,
  record: CapabilityLaunchSupportRecord
): Promise<void> {
  const existing = (await db.query('capabilityLaunchSupportRecords').collect()).find(
    (document) => stringField(document, 'supportRecordId') === DEV_SEED_SUPPORT_RECORD_ID
  )
  const now = record.lastReviewedAt
  const patch = {
    supportRecordId: DEV_SEED_SUPPORT_RECORD_ID,
    businessId,
    capability: record.capability,
    status: 'open',
    reason: 'phase2_human_inquiry_support_ready',
    evidenceRefs: record.evidenceRefs,
    primaryOwnerRef: ownerId,
    primaryAdminOperatorRef: record.primaryAdminOperatorRef,
    backupOwnerRef: record.backupOwnerRef,
    backupAdminOperatorRef: record.backupAdminOperatorRef,
    supportedStage: record.supportedStage,
    supportedChannels: [...record.supportedChannels],
    capacityThresholdJson: JSON.stringify(record.capacityThreshold),
    backlogAgeThresholdMs: record.backlogAgeThresholdMs,
    phaseIncidentCountsJson: JSON.stringify(record.phaseIncidentCounts),
    supportEscalationPath: record.supportEscalationPath,
    claimDisablePath: record.claimDisablePath,
    perChannelKillRulesJson: JSON.stringify(record.perChannelKillRules),
    sourceHash: record.sourceHash,
    correlationId: record.correlationId,
    lastReviewedAt: record.lastReviewedAt,
    operatorNextAction: 'watch owner inbox and notification delivery readback',
    updatedAt: now,
  }

  if (existing === undefined) {
    await db.insert('capabilityLaunchSupportRecords', { ...patch, createdAt: now })
    return
  }

  await db.patch(existing._id, patch)
}

function stringField(document: RuntimeDocument, field: string): string {
  const value = document[field]
  return typeof value === 'string' ? value : ''
}
