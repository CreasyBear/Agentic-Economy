import {
  buildBusinessSupplyProjection,
  type BusinessOfferingRecord,
  type BusinessOfferingRevisionRecord,
  type OfferingAccessPathDescriptor,
  type OfferingAccessPathRecord,
  type OfferingSupportProjection,
  type PublicBusinessProfile,
  type OfferingPrice,
} from '../src/modules/catalog/public'
import type { AccessPathRef, BusinessId, OfferingRef } from '../src/modules/common/ids'
import type { RuntimeDb, RuntimeDocument } from './source_state'

export async function rebuildBusinessSupplyProjectionSnapshotCommand(db: RuntimeDb, businessId: string, supportByOfferingRef: Readonly<Record<string, OfferingSupportProjection>>, now: number): Promise<{ kind: 'ok'; sourceDigest: string } | { kind: 'error'; code: string }> {
  if (!await controlEnabled(db, 'offering_public_projection_enabled', now)) {
    return markPending(db, businessId, 'projection_disabled', now)
  }
  const business = await db.get(businessId)
  const context = await db.query('businessContexts').withIndex('by_business', (q) => q.eq('businessId', businessId)).unique()
  if (business === null || context === null || field(business, 'publicStatus') !== 'published') return markPending(db, businessId, 'business_not_public', now)
  const [offerings, revisions, paths] = await Promise.all([
    db.query('businessOfferings').withIndex('by_businessId_and_status', (q) => q.eq('businessId', businessId)).collect(),
    db.query('businessOfferingRevisions').withIndex('by_businessId_and_createdAt', (q) => q.eq('businessId', businessId)).collect(),
    db.query('offeringAccessPaths').withIndex('by_businessId_and_status', (q) => q.eq('businessId', businessId)).collect(),
  ])
  const offeringRecords = offerings.map(toOffering)
  const revisionRecords = revisions.map(toRevision)
  const pathRecords = paths.map(toPath)
  if (offeringRecords.some((offering) => !revisionRecords.some((revision) => revision.offeringRef === offering.offeringRef && revision.revision === offering.currentRevision))) {
    return markPending(db, businessId, 'offering_revision_missing', now)
  }
  const projection = buildBusinessSupplyProjection({
    business: {
      businessId: businessId as BusinessId,
      slug: field(business, 'slug'),
      name: field(business, 'name'),
      category: field(context, 'category'),
      suburb: field(context, 'suburb'),
      stateTerritory: field(context, 'stateTerritory'),
      ...(optional(business, 'publishedPhone') ? { publishedPhone: field(business, 'publishedPhone') } : {}),
      ...(optional(context, 'postcode') ? { postcode: field(context, 'postcode') } : {}),
      publicUrl: `/${field(business, 'slug')}`,
      trustTier: businessTrustTier(business),
      ...(typeof context.responseTimeMinutes === 'number' ? { responseTimeMinutes: context.responseTimeMinutes } : {}),
      photos: businessPhotos(context),
    },
    businessIsPublic: !await suppressed(db, businessId),
    offerings: offeringRecords.map((offering) => ({ offering, revision: revisionRecords.find((item) => item.offeringRef === offering.offeringRef && item.revision === offering.currentRevision)!, accessPaths: pathRecords.filter((item) => item.offeringRef === offering.offeringRef), support: sanitizeSupport(supportByOfferingRef[offering.offeringRef], now) })),
    sourceRevision: Math.max(number(business, 'updatedAt'), ...offeringRecords.map((item) => item.updatedAt), 0), observedAt: now,
  })
  if (projection.kind === 'unavailable') return markPending(db, businessId, projection.reason, now)
  const existing = await db.query('businessSupplyProjectionSnapshots').withIndex('by_businessId', (q) => q.eq('businessId', businessId)).unique()
  const row = { businessId, sourceRevision: projection.projection.sourceRevision, sourceDigest: projection.projection.sourceDigest, observedAt: now, disposition: projection.projection.disposition, projectionJson: JSON.stringify(projection.projection), status: 'current', updatedAt: now }
  if (existing === null) await db.insert('businessSupplyProjectionSnapshots', row); else await db.patch(existing._id, row)
  return { kind: 'ok', sourceDigest: projection.projection.sourceDigest }
}

export async function deriveBusinessOfferingSupportFromCapabilitySupply(db: RuntimeDb, businessId: string, now: number): Promise<Record<string, OfferingSupportProjection>> {
  const result: Record<string, OfferingSupportProjection> = {}
  const offerings = await db.query('capabilityOfferings').withIndex('by_businessId_and_status', (q) => q.eq('businessId', businessId).eq('status', 'active')).collect()
  for (const supply of offerings) {
    const origin = supply.origin as { kind?: string; offeringRef?: string; offeringRevision?: number; offeringSourceHash?: string; declaredAccessPathRef?: string; accessPathSourceHash?: string } | undefined
    if (origin?.kind !== 'catalog_offering' || !origin.offeringRef) continue
    const offering = await db.query('businessOfferings').withIndex('by_offeringRef', (q) => q.eq('offeringRef', origin.offeringRef)).unique()
    const revision = await db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (q) => q.eq('offeringRef', origin.offeringRef).eq('revision', origin.offeringRevision)).unique()
    if (offering === null || revision === null || field(offering, 'businessId') !== businessId || field(offering, 'status') !== 'published' || number(offering, 'currentRevision') !== origin.offeringRevision || field(revision, 'sourceHash') !== origin.offeringSourceHash || !await originCurrent(db, origin)) continue
    const bindings = await db.query('capabilityTransportBindings').withIndex('by_offeringId_and_admission_and_conformance', (q) => q.eq('offeringId', field(supply, 'offeringId')).eq('admission', 'admitted').eq('conformance', 'conformant')).collect()
    let routeable = false; let validUntil: number | undefined; let observedAt: number | undefined
    for (const binding of bindings) {
      const publication = await db.query('capabilityPublications').withIndex('by_bindingId_and_disposition', (q) => q.eq('bindingId', field(binding, 'bindingId')).eq('disposition', 'current')).unique()
      const expiry = publication && typeof publication.readinessValidUntil === 'number' ? publication.readinessValidUntil : undefined
      if (publication?.credentialState === 'ready' && publication.healthState === 'healthy' && expiry !== undefined && expiry > now) { routeable = true; validUntil = validUntil === undefined ? expiry : Math.max(validUntil, expiry); observedAt = typeof publication.readinessObservedAt === 'number' ? publication.readinessObservedAt : now }
    }
    const next: OfferingSupportProjection = routeable ? { integrated: true, routeable: true, reasons: [], ...(observedAt === undefined ? {} : { observedAt }), ...(validUntil === undefined ? {} : { validUntil }) } : { integrated: bindings.length > 0, routeable: false, reasons: bindings.length > 0 ? ['readiness_unavailable'] : ['not_integrated'], observedAt: now }
    if (!result[origin.offeringRef]?.routeable) result[origin.offeringRef] = next
  }
  return result
}

async function originCurrent(db: RuntimeDb, origin: { declaredAccessPathRef?: string; accessPathSourceHash?: string }) { if (!origin.declaredAccessPathRef && !origin.accessPathSourceHash) return true; if (!origin.declaredAccessPathRef || !origin.accessPathSourceHash) return false; const path = await db.query('offeringAccessPaths').withIndex('by_accessPathRef', (q) => q.eq('accessPathRef', origin.declaredAccessPathRef)).unique(); return path !== null && field(path, 'status') === 'published' && field(path, 'sourceHash') === origin.accessPathSourceHash }
async function controlEnabled(db: RuntimeDb, key: string, now: number) { const row = await db.query('operatorControls').withIndex('by_key', (q) => q.eq('key', key)).unique(); return row !== null && row.enabled === true && (typeof row.expiresAt !== 'number' || row.expiresAt > now) }
async function suppressed(db: RuntimeDb, businessId: string) { return await db.query('suppressionRules').withIndex('by_target_status', (q) => q.eq('targetType', 'business').eq('targetRef', businessId).eq('status', 'active')).unique() !== null }
async function markPending(db: RuntimeDb, businessId: string, code: string, now: number): Promise<{ kind: 'error'; code: string }> { const row = await db.query('businessSupplyProjectionSnapshots').withIndex('by_businessId', (q) => q.eq('businessId', businessId)).unique(); if (row) await db.patch(row._id, { status: 'projection_pending', disposition: 'stale', lastErrorCode: code, updatedAt: now }); return { kind: 'error', code } }
function sanitizeSupport(value: OfferingSupportProjection | undefined, now: number): OfferingSupportProjection { if (!value) return { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: now }; if (value.validUntil !== undefined && value.validUntil <= now) return { integrated: value.integrated, routeable: false, reasons: ['readiness_stale'], observedAt: now, validUntil: value.validUntil }; return value.routeable && !value.integrated ? { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: now } : value }
function field(row: RuntimeDocument, key: string) { return typeof row[key] === 'string' ? row[key] as string : '' }
function optional(row: RuntimeDocument, key: string) { return typeof row[key] === 'string' ? row[key] as string : undefined }
function number(row: RuntimeDocument, key: string) { return typeof row[key] === 'number' ? row[key] as number : 0 }
function toOffering(row: RuntimeDocument): BusinessOfferingRecord { const status = field(row, 'status'); return { offeringRef: field(row, 'offeringRef') as OfferingRef, businessId: field(row, 'businessId') as BusinessId, currentRevision: number(row, 'currentRevision'), status: status === 'published' || status === 'paused' || status === 'retired' ? status : 'draft', createdAt: number(row, 'createdAt'), updatedAt: number(row, 'updatedAt') } }
function toRevision(row: RuntimeDocument): BusinessOfferingRevisionRecord { return { offeringRef: field(row, 'offeringRef') as OfferingRef, businessId: field(row, 'businessId') as BusinessId, revision: number(row, 'revision'), name: field(row, 'name'), category: field(row, 'category'), summary: field(row, 'summary'), ...(optional(row, 'serviceAreaSummary') ? { serviceAreaSummary: field(row, 'serviceAreaSummary') } : {}), ...(optional(row, 'availabilitySummary') ? { availabilitySummary: field(row, 'availabilitySummary') } : {}), ...(optional(row, 'pricingSummary') ? { pricingSummary: field(row, 'pricingSummary') } : {}), ...(row.price === undefined ? {} : { price: row.price as OfferingPrice }), sourceHash: field(row, 'sourceHash') as never, createdAt: number(row, 'createdAt') } }
function toPath(row: RuntimeDocument): OfferingAccessPathRecord { const status = field(row, 'status'); return { accessPathRef: field(row, 'accessPathRef') as AccessPathRef, businessId: field(row, 'businessId') as BusinessId, offeringRef: field(row, 'offeringRef') as OfferingRef, offeringRevision: number(row, 'offeringRevision'), offeringSourceHash: field(row, 'offeringSourceHash') as never, status: status === 'published' || status === 'withdrawn' ? status : 'draft', descriptor: row.descriptor as OfferingAccessPathDescriptor, sourceHash: field(row, 'sourceHash') as never, createdAt: number(row, 'createdAt'), updatedAt: number(row, 'updatedAt') } }

function businessTrustTier(document: RuntimeDocument): PublicBusinessProfile['trustTier'] {
  const value = document.trustTier
  return value === 'contact_confirmed' || value === 'listed' || value === 'registry_verified'
    ? value
    : 'claimed'
}

function businessPhotos(document: RuntimeDocument): readonly Readonly<{ url: string; alt: string }>[] {
  const value = document.photos
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const url = 'url' in entry ? entry.url : undefined
    const alt = 'alt' in entry ? entry.alt : undefined
    return typeof url === 'string' && typeof alt === 'string' ? [{ url, alt }] : []
  })
}
