import type { GenericDatabaseReader } from 'convex/server'
import type { DataModel, Id } from '../../../_generated/dataModel'
import { buildBusinessSupplyProjection, MAX_ACCESS_PATHS_PER_OFFERING, type BusinessSupplyProjection, type OfferingSupportProjection } from '../../../../src/modules/catalog/public'
import { normalizeTrustTier } from '../../../../src/modules/business/public'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import { readBusinessContextFromBusiness, readBusinessSource, toOffering, toPath, toRevision } from './catalogRows'

export const MAX_BUSINESS_CATALOG_OFFERINGS_PER_REBUILD = 100

export type CapabilityProjectionReadDb = GenericDatabaseReader<DataModel>

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

function sanitizeSupport(value: OfferingSupportProjection | undefined, now: number): OfferingSupportProjection {
  if (!value) return { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: now }
  if (value.validUntil !== undefined && value.validUntil <= now) {
    return { integrated: value.integrated, routeable: false, reasons: ['readiness_stale'], observedAt: now, validUntil: value.validUntil }
  }
  return value.routeable && !value.integrated
    ? { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: now }
    : value
}
