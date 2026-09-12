import { v } from 'convex/values'
import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import { internal } from './_generated/api'
import type { DataModel, Doc, Id } from './_generated/dataModel'
import { internalMutation, query } from './_generated/server'
import { providerRouteabilityIsFrozen } from './lib/providerOffboardingFreeze'
import {
  buildBusinessSupplyProjection,
  BusinessOfferingStatusValues,
  ExternalOperationProvenanceValues,
  HumanRequestChannelValues,
  MAX_ACCESS_PATHS_PER_OFFERING,
  normalizeOfferingPrice,
  OfferingAccessPathStatusValues,
  type BusinessOfferingRecord,
  type BusinessOfferingRevisionRecord,
  type BusinessSupplyProjection,
  type OfferingAccessPathDescriptor,
  type OfferingAccessPathRecord,
  type OfferingPrice,
  type OfferingSupportProjection,
} from '../src/modules/catalog/public'
import {
  MAX_ELIGIBLE_SUPPLY,
  type CapabilityOfferingOrigin,
  type CapabilityOfferingRow,
} from '../src/modules/capability-supply/public'
import { normalizeTrustTier, type BusinessContext } from '../src/modules/business/public'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import { isRecord } from '../src/modules/common/is-record'
import type { StableHashValue } from '../src/modules/common/stable-hash'
import {
  buildRegistrySearchDocumentsForCatalog,
  projectBusinessSupplyToPublicApi,
} from '../src/modules/registry/public'
import { qualifySuppliedCandidate } from '../src/modules/capability-supply/public'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { directoryListingEligible } from './capabilitySupplyDirectoryEligibility'

const MAX_BUSINESS_CATALOG_OFFERINGS_PER_REBUILD = 100
const BUSINESS_PROJECTION_REBUILD_PAGE_SIZE = 25

type RebuildAllBusinessSupplyProjectionsResult = {
  processed: number
  rebuilt: number
  skipped: number
  isDone: boolean
  continueCursor: string | null
}

/**
 * Permanent maintenance entry point for catalogue projections; run with
 * `npx convex run capabilitySupplyProjection:rebuildAllBusinessSupplyProjections '{}'`.
 *
 * `registrySearchDocuments` is the only table public business search reads, and
 * it is written solely by the projection rebuild below. Any business onboarded
 * through a path that skipped the rebuild - dev seed, curated bootstrap,
 * facilitator discovery - stays invisible to business search until this sweep
 * runs. The command diffs documents against the stored rows, so repeated runs
 * are idempotent.
 *
 * The hot publish path (`rebuildCapabilityOriginSupplyProjection`) no longer
 * skips programmable providers either - it runs the same derive-and-rebuild
 * for them and only defers when a fleet outgrows one transaction's page
 * (`*_requires_pagination` / `*_capacity_exceeded`), logging a structured
 * warning instead of failing the publish. This sweep is the recovery path for
 * those deferred businesses, plus any row published before 2026-09-10 (when
 * programmable providers were still skipped outright and left with no search
 * document at all). A fleet larger than the rebuild's page cap still throws
 * here too, so one oversized provider is counted as skipped instead of
 * aborting the whole sweep.
 */
export const rebuildAllBusinessSupplyProjections = internalMutation({
  args: { cursor: v.optional(v.string()), dryRun: v.optional(v.boolean()) },
  returns: v.object({
    processed: v.number(),
    rebuilt: v.number(),
    skipped: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<RebuildAllBusinessSupplyProjectionsResult> => {
    const now = Date.now()
    const dryRun = args.dryRun === true
    const page = await ctx.db.query('businesses').paginate({
      cursor: args.cursor ?? null,
      numItems: BUSINESS_PROJECTION_REBUILD_PAGE_SIZE,
    })
    let rebuilt = 0
    let skipped = 0
    for (const business of page.page) {
      // A frozen provider must not be re-published into search; same guard
      // `rebuildCapabilityOriginSupplyProjection` applies. That wrapper lives in
      // `capabilitySupplyShared`, which imports this module, so calling it from
      // here would close an import cycle.
      if (await providerRouteabilityIsFrozen(ctx, business._id)) {
        skipped += 1
        continue
      }
      try {
        const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, business._id, now)
        if (dryRun) {
          // The command writes, so a dry run reports what it would rebuild by
          // reading the same projection the command reads before writing.
          const projection = await readLiveBusinessSupplyProjection({ db: ctx.db, businessId: business._id, support, now })
          if (projection === null) skipped += 1
          else rebuilt += 1
          continue
        }
        const result = await rebuildBusinessSupplyProjectionSnapshotCommand({
          db: ctx.db,
          sourceDb: ctx.db,
          businessId: business._id,
          support,
          now,
        })
        if (result.kind === 'ok') rebuilt += 1
        else skipped += 1
      } catch (error) {
        console.warn('rebuild_all_business_supply_projections_skipped', business.slug, error)
        skipped += 1
      }
    }
    if (!page.isDone && !dryRun) {
      await ctx.scheduler.runAfter(0, internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {
        cursor: page.continueCursor,
      })
    }
    return {
      processed: page.page.length,
      rebuilt,
      skipped,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    }
  },
})

// The scheduled function name Convex records for `internal.workloadCron.reconcileBusinessSupplyProjections`
// (module:exportName), i.e. the hourly "reconcile business supply projections" cron.
const RECONCILE_BUSINESS_SUPPLY_PROJECTIONS_JOB_NAME = 'workloadCron:reconcileBusinessSupplyProjections'
// Newest-first, bounded: same pattern as `scheduledFunctionRetirement.cancelByName` -
// the cron self-reschedules, so its live/next-pending row sits at the head of
// `_scheduled_functions` with the most recently completed run just behind it.
const SCHEDULED_FUNCTION_FRESHNESS_SCAN_LIMIT = 500

/**
 * Freshness signal for `market-tools/list` and `market-tools/search` (review
 * issue 4A / C16): those routes read `registrySearchDocuments`, which this
 * file's rebuild keeps current via the hourly workload cron. Returns the most
 * recent `completedTime` Convex recorded for that cron, or `null` if it has
 * never completed.
 */
export const latestReconcileBusinessSupplyProjectionsCompletion = query({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) => {
    const jobs = await ctx.db.system
      .query('_scheduled_functions')
      .order('desc')
      .take(SCHEDULED_FUNCTION_FRESHNESS_SCAN_LIMIT)
    for (const job of jobs) {
      if (job.name !== RECONCILE_BUSINESS_SUPPLY_PROJECTIONS_JOB_NAME) continue
      if (job.completedTime !== undefined) return job.completedTime
    }
    return null
  },
})

export type CapabilityProjectionDb = GenericDatabaseWriter<DataModel>
type CapabilityProjectionReadDb = GenericDatabaseReader<DataModel>

export async function readLiveBusinessSupplyProjection(input: {
  db: CapabilityProjectionReadDb
  businessId: Id<'businesses'>
  support: Readonly<Record<string, OfferingSupportProjection>>
  now: number
}): Promise<BusinessSupplyProjection | null> {
  const { db, businessId, support, now } = input
  const businessRow = await db.get(businessId)
  const business = businessRow === null ? null : readBusinessSource(businessRow)
  const context = businessRow === null ? null : readBusinessContextFromBusiness(businessRow)
  if (
    business === null
    || context === null
    || business.publicStatus !== 'published'
    || business.suppressedAt !== undefined
  ) return null
  const offeringRows = await db.query('businessOfferings')
    .withIndex('by_businessId_and_status', (q) => q.eq('businessId', businessId))
    .take(MAX_BUSINESS_CATALOG_OFFERINGS_PER_REBUILD + 1)
  if (offeringRows.length > MAX_BUSINESS_CATALOG_OFFERINGS_PER_REBUILD) throw new Error('business_catalog_rebuild_requires_pagination')
  const offeringRecords = offeringRows.map(toOffering)
  const revisionRows = await Promise.all(offeringRecords.map((offering) => (
    db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (q) => (
        q.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
      ))
      .unique()
  )))
  const revisionRecords = revisionRows.flatMap((row) => row === null ? [] : [toRevision(row)])
  const publishedOfferings = offeringRecords.filter((offering) => offering.status === 'published')
  const pathRows = await Promise.all(publishedOfferings.map((offering) => (
    db.query('offeringAccessPaths')
      .withIndex('by_offeringRef_and_status', (q) => q.eq('offeringRef', offering.offeringRef))
      .take(MAX_ACCESS_PATHS_PER_OFFERING + 1)
  )))
  if (pathRows.some((rows) => rows.length > MAX_ACCESS_PATHS_PER_OFFERING)) {
    throw new Error('offering_access_path_capacity_exceeded')
  }
  const pathRecords = pathRows.flat().map(toPath)
  if (offeringRecords.some((offering) => !revisionRecords.some((revision) =>
    revision.offeringRef === offering.offeringRef && revision.revision === offering.currentRevision
  ))) {
    return null
  }
  const projectionOfferings = offeringRecords.map((offering) => {
    const revision = revisionRecords.find((item) =>
      item.offeringRef === offering.offeringRef && item.revision === offering.currentRevision
    )
    if (revision === undefined) throw new Error('offering_revision_missing')
    return {
      offering,
      revision,
      accessPaths: pathRecords.filter((item) => item.offeringRef === offering.offeringRef),
      support: sanitizeSupport(support[offering.offeringRef], now),
    }
  })
  const projection = buildBusinessSupplyProjection({
    business: {
      businessId: brandNonEmpty(businessId, 'BusinessId'),
      slug: business.slug,
      name: business.name,
      category: context.category,
      businessContext: context.businessContext,
      publicUrl: `/${business.slug}`,
      trustTier: normalizeTrustTier(business.trustTier),
      ...(context.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: context.responseTimeMinutes }),
      ...(context.photos === undefined || context.photos.length === 0 ? {} : { photos: context.photos }),
    },
    businessIsPublic: true,
    offerings: projectionOfferings,
    sourceRevision: Math.max(business.updatedAt, ...offeringRecords.map((item) => item.updatedAt), 0),
    observedAt: now,
  })
  return projection.kind === 'unavailable' ? null : projection.projection
}

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

export async function deriveBusinessOfferingSupportFromCapabilitySupply(
  db: CapabilityProjectionReadDb,
  businessId: Id<'businesses'>,
  now: number,
): Promise<Record<string, OfferingSupportProjection>> {
  const result: Record<string, OfferingSupportProjection> = {}
  const offerings = (await db.query('capabilityOfferings')
    .withIndex('by_businessId_and_status', (q) => q.eq('businessId', businessId).eq('status', 'active'))
    .take(MAX_ELIGIBLE_SUPPLY + 1)).map(readCapabilityOffering)
  if (offerings.length > MAX_ELIGIBLE_SUPPLY) throw new Error('capability_offering_capacity_exceeded')
  const currentPublications = (await db.query('capabilityPublications')
    .withIndex('by_businessId_and_disposition', (q) => q.eq('businessId', businessId).eq('disposition', 'current'))
    .take(MAX_ELIGIBLE_SUPPLY + 1)).map(readCapabilityPublication)
  if (currentPublications.length > MAX_ELIGIBLE_SUPPLY) throw new Error('capability_publication_capacity_exceeded')
  const catalogOfferings = offerings.flatMap((supply) => {
    const origin = catalogOfferingOrigin(supply.origin)
    return origin === undefined ? [] : [{ offeringRef: origin.offeringRef, supply }]
  })
  for (const publication of currentPublications) {
    const offeringRow = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (q) => q.eq('offeringId', publication.offeringId))
      .unique()
    const offering = offeringRow === null ? null : readCapabilityOffering(offeringRow)
    if (offering === null || offering.businessId !== businessId || offering.status !== 'active') continue
    const origin = catalogOfferingOrigin(offering.origin)
    if (origin === undefined) continue
    const bindingRow = await db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (q) => q.eq('bindingId', publication.bindingId))
      .unique()
    const binding = bindingRow === null ? null : readCapabilityBinding(bindingRow)
    if (
      binding === null
      || binding.offeringId !== offering.offeringId
      || binding.admission !== 'admitted'
      || binding.conformance !== 'conformant'
    ) continue
    const qualification = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(db), {
      candidate: {
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        networkId: publication.networkId,
        businessId: publication.businessId,
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        contractRef: {
          capabilityId: publication.capabilityId,
          version: publication.version,
          contractDigest: publication.contractDigest,
        },
      },
      now,
    })
    const readinessObservedAt = publication.readinessObservedAt
    const expiry = publication.readinessValidUntil
    // Same directory quality bar applied to the admitted registry's Tool
    // reads (capabilitySupplyToolShared.ts:directoryListingEligible):
    // reviewed-tier (provider_owned/ae_curated_external) is exempt; a
    // listed-tier publication (third_party_gateway/observed_external) must
    // still clear the directory's eligibility bar to count as routeable
    // here. No catalog_offering-origin publication is listed-tier today
    // (facilitator discovery only ever publishes standalone-origin
    // offerings), so this is currently a no-op guard against that changing
    // silently rather than an active filter.
    const routeable = qualification.status === 'eligible'
      && await directoryListingEligible({ db }, publication.authorityMode, publication.sourceRouteRef)
    const next: OfferingSupportProjection = routeable
      ? {
          integrated: true,
          routeable: true,
          reasons: [],
          ...(readinessObservedAt === undefined ? { observedAt: now } : { observedAt: readinessObservedAt }),
          ...(expiry === undefined ? {} : { validUntil: expiry }),
        }
      : { integrated: true, routeable: false, reasons: ['readiness_unavailable'], observedAt: now }
    if (!result[origin.offeringRef]?.routeable) result[origin.offeringRef] = next
  }
  for (const { offeringRef, supply } of catalogOfferings) {
    if (result[offeringRef] !== undefined) continue
    const bindingRows = await db.query('capabilityTransportBindings')
      .withIndex('by_offeringId_and_admission_and_conformance', (query) => query
        .eq('offeringId', supply.offeringId)
        .eq('admission', 'admitted')
        .eq('conformance', 'conformant'))
      .take(1)
    result[offeringRef] = bindingRows.length === 0
      ? { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: now }
      : { integrated: true, routeable: false, reasons: ['readiness_unavailable'], observedAt: now }
  }
  return result
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

function sanitizeSupport(value: OfferingSupportProjection | undefined, now: number): OfferingSupportProjection {
  if (!value) return { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: now }
  if (value.validUntil !== undefined && value.validUntil <= now) {
    return { integrated: value.integrated, routeable: false, reasons: ['readiness_stale'], observedAt: now, validUntil: value.validUntil }
  }
  return value.routeable && !value.integrated
    ? { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: now }
    : value
}

type BusinessSource = {
  slug: string
  name: string
  publicStatus?: string
  updatedAt: number
  trustTier: unknown
  suppressedAt?: number
}

type BusinessContextSource = {
  category: string
  businessContext: BusinessContext
  responseTimeMinutes?: number
  photos?: readonly Readonly<{ url: string; alt: string }>[]
}

function readBusinessSource(row: Doc<'businesses'>): BusinessSource {
  const publicStatus = optionalString(row, 'publicStatus')
  const suppressedAt = optionalNumber(row, 'suppressedAt')
  return {
    slug: requiredString(row, 'slug'),
    name: requiredString(row, 'name'),
    ...(publicStatus === undefined ? {} : { publicStatus }),
    updatedAt: requiredNumber(row, 'updatedAt'),
    trustTier: row.trustTier,
    ...(suppressedAt === undefined ? {} : { suppressedAt }),
  }
}

function readBusinessContextFromBusiness(row: Doc<'businesses'>): BusinessContextSource {
  return {
    category: requiredString(row, 'category'),
    businessContext: row.businessContext,
  }
}

function toOffering(row: Doc<'businessOfferings'>): BusinessOfferingRecord {
  return {
    offeringRef: brandNonEmpty(requiredString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    currentRevision: requiredNumber(row, 'currentRevision'),
    status: readLiteral(row.status, BusinessOfferingStatusValues, 'status'),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
  }
}

function toRevision(row: Doc<'businessOfferingRevisions'>): BusinessOfferingRevisionRecord {
  const price = row.price === undefined ? undefined : offeringPrice(row.price)
  const serviceAreaSummary = optionalString(row, 'serviceAreaSummary')
  const availabilitySummary = optionalString(row, 'availabilitySummary')
  const pricingSummary = optionalString(row, 'pricingSummary')
  return {
    offeringRef: brandNonEmpty(requiredString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    revision: requiredNumber(row, 'revision'),
    name: requiredString(row, 'name'),
    category: requiredString(row, 'category'),
    summary: requiredString(row, 'summary'),
    ...(serviceAreaSummary === undefined ? {} : { serviceAreaSummary }),
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    ...(pricingSummary === undefined ? {} : { pricingSummary }),
    ...(price === undefined ? {} : { price }),
    sourceHash: brandNonEmpty(requiredString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
  }
}

function toPath(row: Doc<'offeringAccessPaths'>): OfferingAccessPathRecord {
  return {
    accessPathRef: brandNonEmpty(requiredString(row, 'accessPathRef'), 'AccessPathRef'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    offeringRef: brandNonEmpty(requiredString(row, 'offeringRef'), 'OfferingRef'),
    offeringRevision: requiredNumber(row, 'offeringRevision'),
    offeringSourceHash: brandNonEmpty(requiredString(row, 'offeringSourceHash'), 'SourceHash'),
    status: readLiteral(row.status, OfferingAccessPathStatusValues, 'status'),
    descriptor: readDescriptor(row.descriptor),
    sourceHash: brandNonEmpty(requiredString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
  }
}

type CapabilityOfferingSource = {
  offeringId: string
  businessId: string
  status: CapabilityOfferingRow['status']
  origin: unknown
}

type CapabilityPublicationSource = {
  publicationRef: string
  revision: number
  networkId: string
  businessId: string
  capabilityId: string
  version: number
  contractDigest: string
  offeringId: string
  bindingId: string
  credentialState: string
  healthState: string
  readinessObservedAt?: number
  readinessValidUntil?: number
  readinessLastHealthyAt?: number
  authorityMode: 'provider_owned' | 'ae_curated_external' | 'third_party_gateway' | 'observed_external'
  sourceRouteRef?: string
}

type CapabilityBindingSource = {
  offeringId: string
  admission: string
  conformance: string
}

function readCapabilityOffering(row: Doc<'capabilityOfferings'>): CapabilityOfferingSource {
  return {
    offeringId: requiredString(row, 'offeringId'),
    businessId: requiredString(row, 'businessId'),
    status: readLiteral<CapabilityOfferingRow['status']>(row.status, ['inactive', 'active'], 'status'),
    origin: row.origin,
  }
}

function readCapabilityPublication(row: Doc<'capabilityPublications'>): CapabilityPublicationSource {
  const readinessObservedAt = optionalNumber(row, 'readinessObservedAt')
  const readinessValidUntil = optionalNumber(row, 'readinessValidUntil')
  const readinessLastHealthyAt = optionalNumber(row, 'readinessLastHealthyAt')
  const sourceRouteRef = optionalString(row, 'sourceRouteRef')
  return {
    publicationRef: requiredString(row, 'publicationRef'),
    revision: requiredNumber(row, 'revision'),
    networkId: requiredString(row, 'networkId'),
    businessId: requiredString(row, 'businessId'),
    capabilityId: requiredString(row, 'capabilityId'),
    version: requiredNumber(row, 'version'),
    contractDigest: requiredString(row, 'contractDigest'),
    offeringId: requiredString(row, 'offeringId'),
    bindingId: requiredString(row, 'bindingId'),
    credentialState: requiredString(row, 'credentialState'),
    healthState: requiredString(row, 'healthState'),
    authorityMode: readLiteral(row.authorityMode, ['provider_owned', 'ae_curated_external', 'third_party_gateway', 'observed_external'], 'authorityMode'),
    ...(readinessObservedAt === undefined ? {} : { readinessObservedAt }),
    ...(readinessValidUntil === undefined ? {} : { readinessValidUntil }),
    ...(readinessLastHealthyAt === undefined ? {} : { readinessLastHealthyAt }),
    ...(sourceRouteRef === undefined ? {} : { sourceRouteRef }),
  }
}

function readCapabilityBinding(row: Doc<'capabilityTransportBindings'>): CapabilityBindingSource {
  return {
    offeringId: requiredString(row, 'offeringId'),
    admission: requiredString(row, 'admission'),
    conformance: requiredString(row, 'conformance'),
  }
}

type CatalogOfferingOrigin = Extract<CapabilityOfferingOrigin, { kind: 'catalog_offering' }>

function catalogOfferingOrigin(value: unknown): CatalogOfferingOrigin | undefined {
  if (!isRecord(value) || value.kind !== 'catalog_offering') return undefined
  if (
    typeof value.offeringRef !== 'string'
    || typeof value.offeringRevision !== 'number'
    || typeof value.offeringSourceHash !== 'string'
  ) return undefined
  const origin = {
    kind: 'catalog_offering' as const,
    offeringRef: value.offeringRef,
    offeringRevision: value.offeringRevision,
    offeringSourceHash: value.offeringSourceHash,
  }
  if (value.declaredAccessPathRef === undefined && value.accessPathSourceHash === undefined) return origin
  if (typeof value.declaredAccessPathRef !== 'string' || typeof value.accessPathSourceHash !== 'string') return undefined
  return {
    ...origin,
    declaredAccessPathRef: value.declaredAccessPathRef,
    accessPathSourceHash: value.accessPathSourceHash,
  }
}

function offeringPrice(value: unknown): OfferingPrice | undefined {
  if (!isRecord(value)) return undefined
  const allowedFields = value.kind === 'quote_only'
    ? ['kind', 'currency', 'unit', 'taxTreatment']
    : value.kind === 'fixed' || value.kind === 'from'
      ? ['kind', 'amount', 'unit', 'taxTreatment']
      : value.kind === 'range'
        ? ['kind', 'minimum', 'maximum', 'unit', 'taxTreatment']
        : undefined
  if (allowedFields === undefined || Object.keys(value).some((field) => !allowedFields.includes(field))) return undefined
  return normalizeOfferingPrice({
    ...(typeof value.kind === 'string' ? { kind: value.kind } : {}),
    ...(typeof value.currency === 'string' ? { currency: value.currency } : {}),
    ...(value.amount === undefined ? {} : { amount: value.amount }),
    ...(value.minimum === undefined ? {} : { minimum: value.minimum }),
    ...(value.maximum === undefined ? {} : { maximum: value.maximum }),
    ...(typeof value.unit === 'string' ? { unit: value.unit } : {}),
    ...(typeof value.taxTreatment === 'string' ? { taxTreatment: value.taxTreatment } : {}),
  })
}

function readDescriptor(value: unknown): OfferingAccessPathDescriptor {
  if (!isRecord(value)) throw new Error('invalid_offering_access_path_descriptor')
  if (value.kind === 'human_request') {
    const url = optionalString(value, 'url')
    return {
      kind: 'human_request',
      channel: readLiteral(value.channel, HumanRequestChannelValues, 'channel'),
      disclosure: requiredString(value, 'disclosure'),
      ...(url === undefined ? {} : { url }),
    }
  }
  if (value.kind === 'external_operation') {
    const interfaceDescription = value.interfaceDescription
    const parsedInterface = interfaceDescription === undefined
      ? undefined
      : readInterfaceDescription(interfaceDescription)
    const method = optionalString(value, 'method')
    const documentationUrl = optionalString(value, 'documentationUrl')
    const authenticationSummary = optionalString(value, 'authenticationSummary')
    const pricingSummary = optionalString(value, 'pricingSummary')
    return {
      kind: 'external_operation',
      name: requiredString(value, 'name'),
      summary: requiredString(value, 'summary'),
      url: requiredString(value, 'url'),
      ...(method === undefined ? {} : { method }),
      ...(documentationUrl === undefined ? {} : { documentationUrl }),
      ...(parsedInterface === undefined ? {} : { interfaceDescription: parsedInterface }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      provenance: readLiteral(value.provenance, ExternalOperationProvenanceValues, 'provenance'),
    }
  }
  throw new Error('invalid_offering_access_path_descriptor')
}

function readInterfaceDescription(value: unknown): { format: string; url?: string } {
  if (!isRecord(value)) throw new Error('invalid_offering_interface_description')
  const url = optionalString(value, 'url')
  return { format: requiredString(value, 'format'), ...(url === undefined ? {} : { url }) }
}

function requiredString<Row extends object>(row: Row, field: keyof Row): string {
  const value = row[field]
  if (typeof value !== 'string') throw new Error(`invalid_projection_${String(field)}`)
  return value
}

function optionalString<Row extends object>(row: Row, field: keyof Row): string | undefined {
  const value = row[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`invalid_projection_${String(field)}`)
  return value
}

function requiredNumber<Row extends object>(row: Row, field: keyof Row): number {
  const value = row[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`invalid_projection_${String(field)}`)
  return value
}

function optionalNumber<Row extends object>(row: Row, field: keyof Row): number | undefined {
  const value = row[field]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`invalid_projection_${String(field)}`)
  return value
}

function readLiteral<Value extends string>(value: unknown, values: readonly Value[], field: string): Value {
  if (typeof value !== 'string') throw new Error(`invalid_projection_${field}`)
  const match = values.find((candidate) => candidate === value)
  if (match === undefined) throw new Error(`invalid_projection_${field}`)
  return match
}
