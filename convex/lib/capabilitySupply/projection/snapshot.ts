import type { GenericDatabaseWriter } from 'convex/server'
import type { DataModel, Doc, Id } from '../../../_generated/dataModel'
import { type OfferingSupportProjection } from '../../../../src/modules/catalog/public'
import { buildRegistrySearchDocumentsForCatalog, projectBusinessSupplyToPublicApi } from '../../../../src/modules/registry/public'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../../../src/modules/common/stable-hash'
import { readBusinessSource } from './catalogRows'
import { MAX_BUSINESS_CATALOG_OFFERINGS_PER_REBUILD, readLiveBusinessSupplyProjection, type CapabilityProjectionReadDb } from './reads'

type CapabilityProjectionDb = GenericDatabaseWriter<DataModel>

export async function rebuildBusinessSupplyProjectionSnapshotCommand(input: {
  db: CapabilityProjectionDb
  sourceDb: CapabilityProjectionReadDb
  businessId: Id<'businesses'>
  support: Readonly<Record<string, OfferingSupportProjection>>
  now: number
}): Promise<{ kind: 'ok'; sourceDigest: string } | { kind: 'error'; code: string }> {
  const { db, businessId, support, now } = input
  const businessRow = await db.get(businessId)
  if (businessRow === null) return markPending(db, null, 'business_not_public')
  const business = readBusinessSource(businessRow)
  // A business row that is still published and not suppressed is public even
  // when the projection itself comes back null (e.g. a currentRevision with
  // no matching businessOfferingRevisions row - a data-integrity gap, not a
  // retraction). Only purge the business's registrySearchDocuments rows via
  // `markPending` when the business row itself says it is no longer public;
  // otherwise a pre-existing public search document must survive so a caller
  // like `renameProviderBusinessHandler` can see it, detect the conflict, and
  // roll the whole write back instead of silently orphaning stale search
  // data or letting the rename land with search left stale.
  const businessIsPublic = business.publicStatus === 'published' && business.suppressedAt === undefined
  const projection = await readLiveBusinessSupplyProjection({ db, businessId, support, now })
  if (projection === null) {
    return businessIsPublic
      ? { kind: 'error', code: 'business_not_public' }
      : markPending(db, business.slug, 'business_not_public')
  }
  const searchDocuments = buildRegistrySearchDocumentsForCatalog(
    projectBusinessSupplyToPublicApi(projection, now),
  )
  const existingSearchDocuments = await db.query('registrySearchDocuments')
    .withIndex('by_business', (query) => query.eq('businessSlug', business.slug))
    .take(MAX_BUSINESS_CATALOG_OFFERINGS_PER_REBUILD + 1)
  if (existingSearchDocuments.length > MAX_BUSINESS_CATALOG_OFFERINGS_PER_REBUILD) {
    throw new Error('registry_search_document_rebuild_requires_pagination')
  }
  const nextDocumentIds = new Set(searchDocuments.map((document) => document.documentId))
  const writes: Promise<void>[] = existingSearchDocuments.flatMap((document) => (
    nextDocumentIds.has(document.documentId) ? [] : [db.delete(document._id)]
  ))
  for (const document of searchDocuments) {
    const prior = existingSearchDocuments.find((candidate) => candidate.documentId === document.documentId)
    const value = {
      ...document,
      placeKeys: [...document.placeKeys],
      keywords: [...document.keywords],
      sourceHash: projection.sourceDigest,
    }
    if (prior === undefined) writes.push(db.insert('registrySearchDocuments', value).then(() => undefined))
    else if (!sameRegistrySearchDocument(prior, value)) writes.push(db.replace(prior._id, value).then(() => undefined))
  }
  await Promise.all(writes)
  return { kind: 'ok', sourceDigest: projection.sourceDigest }
}
/** Rebuild only the bounded slice selected by the maintenance cursor. */
export async function rebuildBusinessSupplyProjectionPageCommand(input: {
  db: CapabilityProjectionDb
  businessId: Id<'businesses'>
  offeringRows: readonly Doc<'businessOfferings'>[]
  now: number
}): Promise<number> {
  const { db, businessId, now } = input
  let rebuilt = 0
  for (const offering of input.offeringRows) {
    // This one-offering projection is only converted into a search document.
    // Search documents carry no support/callability field; firstRequestMode
    // comes from published access paths. Never serve this partial projection
    // as a catalog detail or publication authority.
    const projection = await readLiveBusinessSupplyProjection({
      db, businessId, now, support: {}, offeringRows: [offering],
    })
    if (projection === null) continue
    const [document] = buildRegistrySearchDocumentsForCatalog(projectBusinessSupplyToPublicApi(projection, now))
    const prior = await db.query('registrySearchDocuments')
      .withIndex('by_offering', (query) => query.eq('businessSlug', projection.business.slug).eq('offeringRef', offering.offeringRef))
      .unique()
    if (document === undefined) {
      if (prior !== null) await db.delete(prior._id)
      continue
    }
    const value = { ...document, placeKeys: [...document.placeKeys], keywords: [...document.keywords], sourceHash: projection.sourceDigest }
    if (prior === null) await db.insert('registrySearchDocuments', value)
    else if (!sameRegistrySearchDocument(prior, value)) await db.replace(prior._id, value)
    rebuilt += 1
  }
  return rebuilt
}

/** Sweep stale search rows in small pages after all canonical offerings have been visited. */
export async function removeStaleBusinessSearchDocumentsPage(input: {
  db: CapabilityProjectionDb
  businessId: Id<'businesses'>
  businessSlug: string
  cursor: string | null
  retract?: boolean
}): Promise<{ isDone: boolean; continueCursor: string }> {
  const { db, businessId, businessSlug, cursor } = input
  const page = await db.query('registrySearchDocuments')
    .withIndex('by_business', (query) => query.eq('businessSlug', businessSlug))
    .paginate({ numItems: 10, cursor })
  for (const document of page.page) {
    if (input.retract) {
      await db.delete(document._id)
      continue
    }
    const offering = await db.query('businessOfferings')
      .withIndex('by_businessId_and_offeringRef', (query) => query.eq('businessId', businessId).eq('offeringRef', document.offeringRef))
      .unique()
    if (offering === null || offering.status !== 'published') {
      await db.delete(document._id)
      continue
    }
    const revision = await db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision))
      .unique()
    if (revision === null) await db.delete(document._id)
  }
  return { isDone: page.isDone, continueCursor: page.continueCursor }
}


function sameRegistrySearchDocument(
  prior: Doc<'registrySearchDocuments'>,
  next: Omit<Doc<'registrySearchDocuments'>, '_id' | '_creationTime'>,
): boolean {
  const {
    _id,
    _creationTime,
    updatedAt: _priorUpdatedAt,
    generatedHash: _priorGeneratedHash,
    sourceHash: _priorSourceHash,
    ...current
  } = prior
  const {
    updatedAt: _nextUpdatedAt,
    generatedHash: _nextGeneratedHash,
    sourceHash: _nextSourceHash,
    ...candidate
  } = next
  void _id
  void _creationTime
  void _priorSourceHash
  void _nextSourceHash
  return canonicalDigest(current as StableHashValue) === canonicalDigest(candidate as StableHashValue)
}

/**
 * Reconciliation path for a business that is no longer public (unpublished or
 * suppressed) or no longer exists at all: `registrySearchDocuments` is
 * write-only from this file's rebuild, so a business that drops out of
 * `readLiveBusinessSupplyProjection` must have its stale search rows deleted
 * here in the same transaction, or it keeps surfacing in business search via
 * both the hot publish path and the hourly reconcile sweep. `businessSlug` is
 * `null` only when the business row itself is gone, in which case there is no
 * index key left to find its documents by.
 */
async function markPending(
  db: CapabilityProjectionDb,
  businessSlug: string | null,
  code: string,
): Promise<{ kind: 'error'; code: string }> {
  if (businessSlug !== null) {
    const staleSearchDocuments = await db.query('registrySearchDocuments')
      .withIndex('by_business', (query) => query.eq('businessSlug', businessSlug))
      .take(MAX_BUSINESS_CATALOG_OFFERINGS_PER_REBUILD + 1)
    if (staleSearchDocuments.length > MAX_BUSINESS_CATALOG_OFFERINGS_PER_REBUILD) {
      throw new Error('registry_search_document_rebuild_requires_pagination')
    }
    await Promise.all(staleSearchDocuments.map((document) => db.delete(document._id)))
  }
  return { kind: 'error', code }
}
