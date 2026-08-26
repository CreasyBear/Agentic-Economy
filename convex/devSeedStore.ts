import type { GenericDatabaseWriter } from 'convex/server'
import type { DataModel, Id } from './_generated/dataModel'
import type { BusinessRecord } from '../src/modules/business/public'
import type { DevSeedCatalogBundle } from '../src/modules/dev/public'
export type DevSeedPersistResult = {
  seededSlugs: readonly string[]
  ownerClerkUserId: string
  ownerId: Id<'owners'>
  businessIdsBySlug: Record<string, Id<'businesses'>>
}

export async function persistDevSeedCatalogState(
  db: GenericDatabaseWriter<DataModel>,
  bundle: DevSeedCatalogBundle,
  canonicalOwnerAuthority: Readonly<{
    principalRef: string
    accountRef: string
  }>,
): Promise<DevSeedPersistResult> {
  const owner = bundle.state.owners.find((candidate) => candidate.clerkUserId === bundle.ownerClerkUserId)
  if (owner === undefined) {
    throw new Error('Dev seed owner was not found in module state.')
  }

  const ownerId = await upsertOwner(db, owner, canonicalOwnerAuthority)
  const businessIdsBySlug: Record<string, Id<'businesses'>> = {}

  for (const business of bundle.state.businesses) {
    const convexBusinessId = await upsertBusiness(db, ownerId, business)
    businessIdsBySlug[business.slug] = convexBusinessId

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
  if (bundle.seededSlugs.length > 0 && primaryBusinessId === undefined) {
    throw new Error('Dev seed primary business id was not resolved.')
  }

  return {
    seededSlugs: bundle.seededSlugs,
    ownerClerkUserId: bundle.ownerClerkUserId,
    ownerId,
    businessIdsBySlug,
  }
}

async function upsertOwner(
  db: GenericDatabaseWriter<DataModel>,
  owner: DevSeedCatalogBundle['state']['owners'][number],
  canonicalOwnerAuthority: Readonly<{
    principalRef: string
    accountRef: string
  }>,
): Promise<Id<'owners'>> {
  const existing = await db
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', owner.clerkUserId))
    .unique()
  const patch = {
    clerkUserId: owner.clerkUserId,
    canonicalPrincipalRef: canonicalOwnerAuthority.principalRef,
    canonicalAccountRef: canonicalOwnerAuthority.accountRef,
    ...(owner.displayName === undefined ? {} : { displayName: owner.displayName }),
    ...(owner.emailHash === undefined ? {} : { emailHash: owner.emailHash }),
    updatedAt: owner.updatedAt,
  }

  if (existing === null) {
    return db.insert('owners', { ...patch, createdAt: owner.createdAt })
  }

  if ((existing.canonicalPrincipalRef !== undefined
      && existing.canonicalPrincipalRef !== canonicalOwnerAuthority.principalRef)
    || (existing.canonicalAccountRef !== undefined
      && existing.canonicalAccountRef !== canonicalOwnerAuthority.accountRef)) {
    throw new Error('Dev seed owner canonical authority conflicts with persisted state.')
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
    businessContext: business.businessContext,
    publicStatus: business.publicStatus,
    trustTier: business.trustTier,
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
