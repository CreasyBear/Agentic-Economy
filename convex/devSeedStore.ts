import type { GenericDatabaseWriter } from 'convex/server'
import type { DataModel, Id } from './_generated/dataModel'
import type { BusinessRecord } from '../src/modules/business/public'
import type { DevSeedCatalogBundle } from '../src/modules/dev/public'
import type { CapabilityLaunchSupportRecord } from '../src/modules/inquiries/public'
export type DevSeedPersistResult = {
  seededSlugs: readonly string[]
  ownerClerkUserId: string
  ownerId: Id<'owners'>
  supportRecordId: string
  businessIdsBySlug: Record<string, Id<'businesses'>>
}

const DEV_SEED_SUPPORT_RECORD_ID = 'support:dev-seed:human-inquiry-owner-inbox'
const RETIRED_DEV_SEED_SLUGS = [
  'ae-sandbox-paid-activation',
  'agentic-economy-r10-readback',
  'agentic-economy-r10-smoke',
] as const

export async function persistDevSeedCatalogState(
  db: GenericDatabaseWriter<DataModel>,
  bundle: DevSeedCatalogBundle,
): Promise<DevSeedPersistResult> {
  const owner = bundle.state.owners.find((candidate) => candidate.clerkUserId === bundle.ownerClerkUserId)
  if (owner === undefined) {
    throw new Error('Dev seed owner was not found in module state.')
  }

  const ownerId = await upsertOwner(db, owner)
  const businessIdsBySlug: Record<string, Id<'businesses'>> = {}
  const contextByBusinessId = new Map(bundle.state.businessContexts.map((context) => [context.businessId, context] as const))
  const claimByBusinessId = new Map(bundle.state.claims.map((claim) => [claim.businessId, claim] as const))

  for (const business of bundle.state.businesses) {
    const convexBusinessId = await upsertBusiness(db, ownerId, business)
    businessIdsBySlug[business.slug] = convexBusinessId

    const context = contextByBusinessId.get(business.businessId)
    if (context === undefined) {
      throw new Error(`Dev seed context missing for ${business.slug}.`)
    }
    await upsertBusinessContext(db, convexBusinessId, context)

    const claim = claimByBusinessId.get(business.businessId)
    if (claim === undefined) {
      throw new Error(`Dev seed claim missing for ${business.slug}.`)
    }
    const convexClaimId = await upsertClaim(db, ownerId, convexBusinessId, claim)

    for (const fingerprint of bundle.state.claimFingerprints.filter((candidate) => candidate.claimId === claim.claimId)) {
      await upsertClaimFingerprint(db, ownerId, convexBusinessId, convexClaimId, fingerprint)
    }

    for (const offering of bundle.state.offerings.filter((candidate) => candidate.businessId === business.businessId)) {
      await upsertBusinessOffering(db, convexBusinessId, offering)
    }
    for (const revision of bundle.state.revisions.filter((candidate) => candidate.businessId === business.businessId)) {
      await upsertBusinessOfferingRevision(db, convexBusinessId, revision)
    }
    for (const accessPath of bundle.state.accessPaths.filter((candidate) => candidate.businessId === business.businessId)) {
      await upsertOfferingAccessPath(db, convexBusinessId, accessPath)
    }
  }

  const primarySlug = bundle.seededSlugs[0]
  const primaryBusinessId = primarySlug === undefined ? undefined : businessIdsBySlug[primarySlug]
  if (primaryBusinessId === undefined) {
    throw new Error('Dev seed primary business id was not resolved.')
  }

  await upsertHumanInquirySupportRecord(db, primaryBusinessId, ownerId, bundle.supportRecord)
  await suppressRetiredDevSeedBusinesses(db)

  return {
    seededSlugs: bundle.seededSlugs,
    ownerClerkUserId: bundle.ownerClerkUserId,
    ownerId,
    supportRecordId: DEV_SEED_SUPPORT_RECORD_ID,
    businessIdsBySlug,
  }
}

async function suppressRetiredDevSeedBusinesses(db: GenericDatabaseWriter<DataModel>): Promise<void> {
  const now = Date.now()
  for (const slug of RETIRED_DEV_SEED_SLUGS) {
    const existing = await db
      .query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', slug))
      .unique()
    if (existing === null) {
      continue
    }

    await db.patch(existing._id, {
      publicStatus: 'suppressed',
      suppressedAt: now,
      updatedAt: now,
    })
  }
}

async function upsertOwner(
  db: GenericDatabaseWriter<DataModel>,
  owner: DevSeedCatalogBundle['state']['owners'][number],
): Promise<Id<'owners'>> {
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
async function upsertBusiness(
  db: GenericDatabaseWriter<DataModel>,
  ownerId: Id<'owners'>,
  business: BusinessRecord,
): Promise<Id<'businesses'>> {
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
    ...(business.publishedPhone === undefined ? {} : { publishedPhone: business.publishedPhone }),
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
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  context: DevSeedCatalogBundle['state']['businessContexts'][number],
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
    sourceRefs: [...context.sourceRefs],
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
  db: GenericDatabaseWriter<DataModel>,
  ownerId: Id<'owners'>,
  businessId: Id<'businesses'>,
  claim: DevSeedCatalogBundle['state']['claims'][number],
): Promise<Id<'claims'>> {
  const existing = await db
    .query('claims')
    .withIndex('by_business_status', (query) => query.eq('businessId', businessId).eq('status', claim.status))
    .unique()
  const patch = {
    ownerId,
    businessId,
    slug: claim.slug,
    status: claim.status,
    submittedFactsHash: claim.submittedFactsHash,
    updatedAt: claim.updatedAt,
  }

  if (existing === null) {
    return db.insert('claims', { ...patch, createdAt: claim.createdAt })
  }

  await db.patch(existing._id, patch)
  return existing._id
}

async function upsertClaimFingerprint(
  db: GenericDatabaseWriter<DataModel>,
  ownerId: Id<'owners'>,
  businessId: Id<'businesses'>,
  claimId: Id<'claims'>,
  fingerprint: DevSeedCatalogBundle['state']['claimFingerprints'][number],
): Promise<void> {
  const existing = await db
    .query('claimFingerprints')
    .withIndex('by_fingerprint_status', (query) =>
      query.eq('fingerprint', fingerprint.fingerprint).eq('status', fingerprint.status),
    )
    .unique()
  const patch = {
    fingerprint: fingerprint.fingerprint,
    status: fingerprint.status,
    businessSlug: fingerprint.businessSlug,
    ownerRef: ownerId,
    claimId,
    updatedAt: fingerprint.updatedAt,
  }

  if (existing === null) {
    await db.insert('claimFingerprints', { ...patch, createdAt: fingerprint.createdAt })
    return
  }

  await db.patch(existing._id, patch)
}

async function upsertBusinessOffering(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  offering: DevSeedCatalogBundle['state']['offerings'][number],
): Promise<void> {
  const existing = await db
    .query('businessOfferings')
    .withIndex('by_offeringRef', (query) => query.eq('offeringRef', offering.offeringRef))
    .unique()
  const currentRevision = existing === null
    ? offering.currentRevision
    : Math.max(existing.currentRevision, offering.currentRevision)
  const patch = {
    offeringRef: offering.offeringRef,
    businessId,
    currentRevision,
    status: offering.status,
    updatedAt: existing !== null && existing.currentRevision > offering.currentRevision
      ? existing.updatedAt
      : offering.updatedAt,
  }

  if (existing === null) {
    await db.insert('businessOfferings', { ...patch, createdAt: offering.createdAt })
    return
  }

  await db.patch(existing._id, patch)
}

async function upsertBusinessOfferingRevision(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  revision: DevSeedCatalogBundle['state']['revisions'][number],
): Promise<void> {
  const existing = await db
    .query('businessOfferingRevisions')
    .withIndex('by_offeringRef_and_revision', (query) => (
      query.eq('offeringRef', revision.offeringRef).eq('revision', revision.revision)
    ))
    .unique()
  const patch = {
    offeringRef: revision.offeringRef,
    businessId,
    revision: revision.revision,
    name: revision.name,
    summary: revision.summary,
    category: revision.category,
    ...(revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: revision.serviceAreaSummary }),
    ...(revision.availabilitySummary === undefined ? {} : { availabilitySummary: revision.availabilitySummary }),
    ...(revision.pricingSummary === undefined ? {} : { pricingSummary: revision.pricingSummary }),
    ...(revision.price === undefined ? {} : { price: revision.price }),
    sourceHash: revision.sourceHash,
  }

  if (existing === null) {
    await db.insert('businessOfferingRevisions', { ...patch, createdAt: revision.createdAt })
    return
  }

  await db.patch(existing._id, patch)
}

async function upsertOfferingAccessPath(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  accessPath: DevSeedCatalogBundle['state']['accessPaths'][number],
): Promise<void> {
  const existing = await db
    .query('offeringAccessPaths')
    .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', accessPath.accessPathRef))
    .unique()
  if (existing !== null && existing.businessId !== businessId) {
    throw new Error('Dev seed access path belongs to another business.')
  }
  if (existing !== null && existing.offeringRevision > accessPath.offeringRevision) {
    return
  }
  const patch = {
    accessPathRef: accessPath.accessPathRef,
    businessId,
    offeringRef: accessPath.offeringRef,
    offeringRevision: accessPath.offeringRevision,
    offeringSourceHash: accessPath.offeringSourceHash,
    status: accessPath.status,
    descriptor: accessPath.descriptor,
    sourceHash: accessPath.sourceHash,
    updatedAt: accessPath.updatedAt,
  }

  if (existing === null) {
    await db.insert('offeringAccessPaths', { ...patch, createdAt: accessPath.createdAt })
    return
  }

  await db.patch(existing._id, patch)
}
async function upsertHumanInquirySupportRecord(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  ownerId: Id<'owners'>,
  record: CapabilityLaunchSupportRecord,
): Promise<void> {
  const existing = await db
    .query('capabilityLaunchSupportRecords')
    .withIndex('by_supportRecordId', (query) => query.eq('supportRecordId', DEV_SEED_SUPPORT_RECORD_ID))
    .unique()
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

  if (existing === null) {
    await db.insert('capabilityLaunchSupportRecords', { ...patch, createdAt: now })
    return
  }

  await db.patch(existing._id, patch)
}
