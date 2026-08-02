import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import type { DataModel, Doc, Id } from './_generated/dataModel'
import {
  buildBusinessSupplyProjection,
  BusinessOfferingStatusValues,
  ExternalOperationProvenanceValues,
  HumanRequestChannelValues,
  MAX_ACCESS_PATHS_PER_OFFERING,
  MAX_OFFERINGS_PER_BUSINESS,
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
import { normalizeTrustTier } from '../src/modules/business/public'
import { brandNonEmpty } from '../src/modules/common/ids'
import { isRecord } from '../src/modules/common/is-record'
import {
  buildRegistrySearchDocumentsForCatalog,
  projectBusinessSupplyToPublicApi,
} from '../src/modules/registry/public'

export type CapabilityProjectionDb = GenericDatabaseWriter<DataModel>
type CapabilityProjectionReadDb = GenericDatabaseReader<DataModel>

export async function rebuildBusinessSupplyProjectionSnapshotCommand(input: {
  db: CapabilityProjectionDb
  sourceDb: CapabilityProjectionReadDb
  businessId: Id<'businesses'>
  support: Readonly<Record<string, OfferingSupportProjection>>
  now: number
}): Promise<{ kind: 'ok'; sourceDigest: string } | { kind: 'error'; code: string }> {
  const { db, sourceDb, businessId, support, now } = input
  if (!await projectionOperatorControlEnabled(sourceDb, 'offering_public_projection_enabled', now)) {
    return markPending(db, businessId, 'projection_disabled', now)
  }
  const businessRow = await db.get(businessId)
  const contextRow = await db.query('businessContexts')
    .withIndex('by_business', (q) => q.eq('businessId', businessId))
    .unique()
  const business = businessRow === null ? null : readBusinessSource(businessRow)
  const context = contextRow === null ? null : readBusinessContextSource(contextRow)
  if (business === null || context === null || business.publicStatus !== 'published') {
    return markPending(db, businessId, 'business_not_public', now)
  }
  const offeringRows = await db.query('businessOfferings')
    .withIndex('by_businessId_and_status', (q) => q.eq('businessId', businessId))
    .take(MAX_OFFERINGS_PER_BUSINESS + 1)
  if (offeringRows.length > MAX_OFFERINGS_PER_BUSINESS) throw new Error('business_offering_capacity_exceeded')
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
    return markPending(db, businessId, 'offering_revision_missing', now)
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
      suburb: context.suburb,
      stateTerritory: context.stateTerritory,
      ...(business.publishedPhone === undefined ? {} : { publishedPhone: business.publishedPhone }),
      ...(context.postcode === undefined ? {} : { postcode: context.postcode }),
      publicUrl: `/${business.slug}`,
      trustTier: normalizeTrustTier(business.trustTier),
      ...(context.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: context.responseTimeMinutes }),
      ...(context.photos === undefined || context.photos.length === 0 ? {} : { photos: context.photos }),
    },
    businessIsPublic: !await businessHasActiveSuppression(sourceDb, businessId),
    offerings: projectionOfferings,
    sourceRevision: Math.max(business.updatedAt, ...offeringRecords.map((item) => item.updatedAt), 0),
    observedAt: now,
  })
  if (projection.kind === 'unavailable') return markPending(db, businessId, projection.reason, now)
  const persistedProjection = toPersistedProjection(projection.projection, businessId)
  const existing = await db.query('businessSupplyProjectionSnapshots')
    .withIndex('by_businessId', (q) => q.eq('businessId', businessId))
    .unique()
  const row = {
    businessId,
    sourceRevision: projection.projection.sourceRevision,
    sourceDigest: projection.projection.sourceDigest,
    observedAt: now,
    disposition: projection.projection.disposition,
    projection: persistedProjection,
    status: 'current' as const,
    updatedAt: now,
  }
  if (existing === null) await db.insert('businessSupplyProjectionSnapshots', row)
  else await db.replace(existing._id, row)
  const searchDocuments = buildRegistrySearchDocumentsForCatalog(
    projectBusinessSupplyToPublicApi(projection.projection, now),
  )
  const existingSearchDocuments = await db.query('registrySearchDocuments')
    .withIndex('by_business', (query) => query.eq('businessSlug', business.slug))
    .take(MAX_OFFERINGS_PER_BUSINESS + 1)
  if (existingSearchDocuments.length > MAX_OFFERINGS_PER_BUSINESS) {
    throw new Error('registry_search_document_capacity_exceeded')
  }
  const nextDocumentIds = new Set(searchDocuments.map((document) => document.documentId))
  await Promise.all([
    ...existingSearchDocuments
      .filter((document) => !nextDocumentIds.has(document.documentId))
      .map((document) => db.delete(document._id)),
    ...searchDocuments.map((document) => {
      const prior = existingSearchDocuments.find((candidate) => candidate.documentId === document.documentId)
      const value = {
        ...document,
        placeKeys: [...document.placeKeys],
        keywords: [...document.keywords],
        sourceHash: projection.projection.sourceDigest,
      }
      return prior === undefined
        ? db.insert('registrySearchDocuments', value)
        : db.replace(prior._id, value)
    }),
  ])
  return { kind: 'ok', sourceDigest: projection.projection.sourceDigest }
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
    const expiry = publication.readinessValidUntil
    const routeable = publication.credentialState === 'ready'
      && publication.healthState === 'healthy'
      && expiry !== undefined
      && expiry > now
    const readinessObservedAt = publication.readinessObservedAt
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

async function markPending(
  db: CapabilityProjectionDb,
  businessId: Id<'businesses'>,
  code: string,
  now: number,
): Promise<{ kind: 'error'; code: string }> {
  const row = await db.query('businessSupplyProjectionSnapshots')
    .withIndex('by_businessId', (q) => q.eq('businessId', businessId))
    .unique()
  if (row) await db.patch(row._id, { status: 'projection_pending', disposition: 'stale', lastErrorCode: code, updatedAt: now })
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
  publishedPhone?: string
  updatedAt: number
  trustTier: unknown
}

type BusinessContextSource = {
  category: string
  suburb: string
  stateTerritory: string
  postcode?: string
  responseTimeMinutes?: number
  photos?: readonly Readonly<{ url: string; alt: string }>[]
}

function readBusinessSource(row: Doc<'businesses'>): BusinessSource {
  const publicStatus = optionalString(row, 'publicStatus')
  const publishedPhone = optionalString(row, 'publishedPhone')
  return {
    slug: requiredString(row, 'slug'),
    name: requiredString(row, 'name'),
    ...(publicStatus === undefined ? {} : { publicStatus }),
    ...(publishedPhone === undefined ? {} : { publishedPhone }),
    updatedAt: requiredNumber(row, 'updatedAt'),
    trustTier: row.trustTier,
  }
}

function readBusinessContextSource(row: Doc<'businessContexts'>): BusinessContextSource {
  const postcode = optionalString(row, 'postcode')
  const responseTimeMinutes = optionalNumber(row, 'responseTimeMinutes')
  const photos = optionalPhotos(row, 'photos')
  return {
    category: requiredString(row, 'category'),
    suburb: requiredString(row, 'suburb'),
    stateTerritory: requiredString(row, 'stateTerritory'),
    ...(postcode === undefined ? {} : { postcode }),
    ...(responseTimeMinutes === undefined ? {} : { responseTimeMinutes }),
    ...(photos === undefined ? {} : { photos }),
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
  offeringId: string
  bindingId: string
  credentialState: string
  healthState: string
  readinessObservedAt?: number
  readinessValidUntil?: number
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
  return {
    offeringId: requiredString(row, 'offeringId'),
    bindingId: requiredString(row, 'bindingId'),
    credentialState: requiredString(row, 'credentialState'),
    healthState: requiredString(row, 'healthState'),
    ...(readinessObservedAt === undefined ? {} : { readinessObservedAt }),
    ...(readinessValidUntil === undefined ? {} : { readinessValidUntil }),
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
  return {
    kind: 'catalog_offering',
    offeringRef: value.offeringRef,
    offeringRevision: value.offeringRevision,
    offeringSourceHash: value.offeringSourceHash,
  }
}

function offeringPrice(value: unknown): OfferingPrice | undefined {
  if (!isRecord(value)) return undefined
  return normalizeOfferingPrice({
    ...(typeof value.kind === 'string' ? { kind: value.kind } : {}),
    ...(typeof value.currency === 'string' ? { currency: value.currency } : {}),
    ...(typeof value.amountMinor === 'number' ? { amountMinor: value.amountMinor } : {}),
    ...(typeof value.maximumAmountMinor === 'number' ? { maximumAmountMinor: value.maximumAmountMinor } : {}),
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

function toPersistedProjection(projection: BusinessSupplyProjection, businessId: Id<'businesses'>) {
  return {
    business: {
      businessId,
      slug: projection.business.slug,
      name: projection.business.name,
      category: projection.business.category,
      suburb: projection.business.suburb,
      stateTerritory: projection.business.stateTerritory,
      ...(projection.business.publishedPhone === undefined ? {} : { publishedPhone: projection.business.publishedPhone }),
      ...(projection.business.postcode === undefined ? {} : { postcode: projection.business.postcode }),
      publicUrl: projection.business.publicUrl,
      trustTier: projection.business.trustTier,
      ...(projection.business.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: projection.business.responseTimeMinutes }),
      ...(projection.business.photos === undefined ? {} : { photos: projection.business.photos.map((photo) => ({ url: photo.url, alt: photo.alt })) }),
    },
    offerings: projection.offerings.map((entry) => ({
      offering: {
        offeringRef: entry.offering.offeringRef,
        revision: entry.offering.revision,
        name: entry.offering.name,
        category: entry.offering.category,
        summary: entry.offering.summary,
        ...(entry.offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: entry.offering.serviceAreaSummary }),
        ...(entry.offering.availabilitySummary === undefined ? {} : { availabilitySummary: entry.offering.availabilitySummary }),
        ...(entry.offering.pricingSummary === undefined ? {} : { pricingSummary: entry.offering.pricingSummary }),
        ...(entry.offering.price === undefined ? {} : { price: { ...entry.offering.price } }),
      },
      accessPaths: entry.accessPaths.map((path) => ({
        accessPathRef: path.accessPathRef,
        descriptor: toPersistedDescriptor(path.descriptor),
      })),
      support: {
        integrated: entry.support.integrated,
        routeable: entry.support.routeable,
        reasons: [...entry.support.reasons],
        ...(entry.support.observedAt === undefined ? {} : { observedAt: entry.support.observedAt }),
        ...(entry.support.validUntil === undefined ? {} : { validUntil: entry.support.validUntil }),
      },
    })),
    sourceRevision: projection.sourceRevision,
    sourceDigest: projection.sourceDigest,
    observedAt: projection.observedAt,
    disposition: projection.disposition,
  }
}

function toPersistedDescriptor(descriptor: OfferingAccessPathDescriptor) {
  if (descriptor.kind === 'human_request') {
    return {
      kind: descriptor.kind,
      channel: descriptor.channel,
      disclosure: descriptor.disclosure,
      ...(descriptor.url === undefined ? {} : { url: descriptor.url }),
    }
  }
  const interfaceDescription = descriptor.interfaceDescription === undefined
    ? undefined
    : {
        format: descriptor.interfaceDescription.format,
        ...(descriptor.interfaceDescription.url === undefined ? {} : { url: descriptor.interfaceDescription.url }),
      }
  return {
    kind: descriptor.kind,
    name: descriptor.name,
    summary: descriptor.summary,
    url: descriptor.url,
    ...(descriptor.method === undefined ? {} : { method: descriptor.method }),
    ...(descriptor.documentationUrl === undefined ? {} : { documentationUrl: descriptor.documentationUrl }),
    ...(interfaceDescription === undefined ? {} : { interfaceDescription }),
    ...(descriptor.authenticationSummary === undefined ? {} : { authenticationSummary: descriptor.authenticationSummary }),
    ...(descriptor.pricingSummary === undefined ? {} : { pricingSummary: descriptor.pricingSummary }),
    provenance: descriptor.provenance,
  }
}

async function projectionOperatorControlEnabled(db: CapabilityProjectionReadDb, key: string, now: number): Promise<boolean> {
  const row = await db.query('operatorControls')
    .withIndex('by_key', (query) => query.eq('key', key))
    .unique()
  if (row === null || readBoolean(row, 'enabled') !== true) return false
  const expiresAt = optionalNumber(row, 'expiresAt')
  return expiresAt === undefined || expiresAt > now
}

async function businessHasActiveSuppression(db: CapabilityProjectionReadDb, businessId: Id<'businesses'>): Promise<boolean> {
  const row = await db.query('suppressionRules')
    .withIndex('by_target_status', (query) =>
      query.eq('targetType', 'business').eq('targetRef', businessId).eq('status', 'active')
    )
    .unique()
  return row !== null
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

function readBoolean<Row extends object>(row: Row, field: keyof Row): boolean {
  const value = row[field]
  if (typeof value !== 'boolean') throw new Error(`invalid_projection_${String(field)}`)
  return value
}

function readLiteral<Value extends string>(value: unknown, values: readonly Value[], field: string): Value {
  if (typeof value !== 'string') throw new Error(`invalid_projection_${field}`)
  const match = values.find((candidate) => candidate === value)
  if (match === undefined) throw new Error(`invalid_projection_${field}`)
  return match
}

function optionalPhotos<Row extends object>(row: Row, field: keyof Row): readonly Readonly<{ url: string; alt: string }>[] | undefined {
  const value = row[field]
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`invalid_projection_${String(field)}`)
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error(`invalid_projection_${String(field)}`)
    return { url: requiredString(entry, 'url'), alt: requiredString(entry, 'alt') }
  })
}
