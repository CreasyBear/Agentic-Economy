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
import { normalizeTrustTier, type BusinessContext } from '../src/modules/business/public'
import { brandNonEmpty } from '../src/modules/common/ids'
import { isRecord } from '../src/modules/common/is-record'
import {
  buildRegistrySearchDocumentsForCatalog,
  projectBusinessSupplyToPublicApi,
} from '../src/modules/registry/public'
import { qualifySuppliedCandidate } from '../src/modules/capability-supply/public'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'

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
  if (business === null || context === null || business.publicStatus !== 'published') return null
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
  const projection = await readLiveBusinessSupplyProjection({ db, businessId, support, now })
  if (projection === null) return markPending(db, businessId, 'business_not_public', now)
  const businessRow = await db.get(businessId)
  if (businessRow === null) return markPending(db, businessId, 'business_not_public', now)
  const business = readBusinessSource(businessRow)
  const searchDocuments = buildRegistrySearchDocumentsForCatalog(
    projectBusinessSupplyToPublicApi(projection, now),
  )
  const existingSearchDocuments = await db.query('registrySearchDocuments')
    .withIndex('by_business', (query) => query.eq('businessSlug', business.slug))
    .take(MAX_OFFERINGS_PER_BUSINESS + 1)
  if (existingSearchDocuments.length > MAX_OFFERINGS_PER_BUSINESS) {
    throw new Error('registry_search_document_capacity_exceeded')
  }
  const nextDocumentIds = new Set(searchDocuments.map((document) => document.documentId))
  await Promise.all([
    ...existingSearchDocuments.flatMap((document) => nextDocumentIds.has(document.documentId) ? [] : [db.delete(document._id)]),
    ...searchDocuments.map((document) => {
      const prior = existingSearchDocuments.find((candidate) => candidate.documentId === document.documentId)
      const value = {
        ...document,
        placeKeys: [...document.placeKeys],
        keywords: [...document.keywords],
        sourceHash: projection.sourceDigest,
      }
      return prior === undefined
        ? db.insert('registrySearchDocuments', value)
        : db.replace(prior._id, value)
    }),
  ])
  return { kind: 'ok', sourceDigest: projection.sourceDigest }
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
    const routeable = qualification.status === 'eligible'
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
  _db: CapabilityProjectionDb,
  _businessId: Id<'businesses'>,
  code: string,
  _now: number,
): Promise<{ kind: 'error'; code: string }> {
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
}

type BusinessContextSource = {
  category: string
  businessContext: BusinessContext
  responseTimeMinutes?: number
  photos?: readonly Readonly<{ url: string; alt: string }>[]
}

function readBusinessSource(row: Doc<'businesses'>): BusinessSource {
  const publicStatus = optionalString(row, 'publicStatus')
  return {
    slug: requiredString(row, 'slug'),
    name: requiredString(row, 'name'),
    ...(publicStatus === undefined ? {} : { publicStatus }),
    updatedAt: requiredNumber(row, 'updatedAt'),
    trustTier: row.trustTier,
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
