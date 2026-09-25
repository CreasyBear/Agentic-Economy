import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import type { DataModel, Doc, Id } from '../../../_generated/dataModel'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import {
  readCatalogAccessPath,
  readCatalogRevision,
  readCatalogStatus,
  requiredCatalogNumber,
  requiredCatalogString,
} from './readModels'
import {
  MAX_ACCESS_PATHS_PER_OFFERING,
  type OfferingSourceState,
} from '../../../../src/modules/catalog/public'

export type OfferingCommandTarget = Readonly<{
  offeringRef?: string
  accessPathRef?: string
}>

export async function loadExactOfferingSourceState(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  target: OfferingCommandTarget,
  operation?: Readonly<{ actorRef: string; operationName: string; operationKey: string }>,
): Promise<OfferingSourceState> {
  const operationRow = operation === undefined
    ? null
    : await db.query('operationKeys')
      .withIndex('by_actor_operation_key', (query) => (
        query.eq('actorRef', operation.actorRef)
          .eq('operationName', operation.operationName)
          .eq('key', operation.operationKey)
      ))
      .unique()
  const toolRefs = readCatalogOperationRefs(operationRow)
  const accessPathRef = target.accessPathRef
  const explicitPath = accessPathRef === undefined
    ? null
    : await db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', accessPathRef))
      .unique()
  const replayRef = toolRefs[0]
  const replayOffering = target.offeringRef === undefined && explicitPath === null && replayRef !== undefined
    ? await db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', replayRef))
      .unique()
    : null
  const replayPath = target.offeringRef === undefined && explicitPath === null && replayOffering === null && replayRef !== undefined
    ? await db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', replayRef))
      .unique()
    : null
  const offeringRef = target.offeringRef
    ?? (explicitPath === null ? undefined : requiredCatalogString(explicitPath, 'offeringRef'))
    ?? (replayOffering === null ? undefined : requiredCatalogString(replayOffering, 'offeringRef'))
    ?? (replayPath === null ? undefined : requiredCatalogString(replayPath, 'offeringRef'))
  const offeringRow = offeringRef === undefined
    ? null
    : await db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', offeringRef))
      .unique()
  const ownedOffering = offeringRow !== null && requiredCatalogString(offeringRow, 'businessId') === businessId
    ? offeringRow
    : null
  const offering = ownedOffering === null ? undefined : {
    offeringRef: brandNonEmpty(requiredCatalogString(ownedOffering, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredCatalogString(ownedOffering, 'businessId'), 'BusinessId'),
    currentRevision: requiredCatalogNumber(ownedOffering, 'currentRevision'),
    status: readCatalogStatus(ownedOffering.status),
    createdAt: requiredCatalogNumber(ownedOffering, 'createdAt'),
    updatedAt: requiredCatalogNumber(ownedOffering, 'updatedAt'),
  }
  const [revisionRow, pathRows] = offering === undefined
    ? [null, []] as const
    : await Promise.all([
        db.query('businessOfferingRevisions')
          .withIndex('by_offeringRef_and_revision', (query) => (
            query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
          ))
          .unique(),
        db.query('offeringAccessPaths')
          .withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offering.offeringRef))
          .take(MAX_ACCESS_PATHS_PER_OFFERING + 1),
      ])
  if (pathRows.length > MAX_ACCESS_PATHS_PER_OFFERING) {
    throw new Error('offering_access_path_capacity_exceeded')
  }
  return {
    offerings: offering === undefined ? [] : [offering],
    revisions: revisionRow === null ? [] : [readCatalogRevision(revisionRow)],
    accessPaths: pathRows.map(readCatalogAccessPath),
    operations: readCatalogOperation(operationRow, toolRefs),
  }
}

function readCatalogOperationRefs(operationRow: Doc<'operationKeys'> | null): string[] {
  if (operationRow === null || operationRow.scope !== 'catalog_offering') return []
  const value = operationRow.effectRefs
  if (!Array.isArray(value) || value.some((ref) => typeof ref !== 'string')) {
    throw new Error('catalog_invalid_operation_effect_refs')
  }
  return value
}

function readCatalogOperation(
  operationRow: Doc<'operationKeys'> | null,
  toolRefs: readonly string[],
): OfferingSourceState['operations'] {
  return toolRefs[0] === undefined || operationRow === null
    ? []
    : [{
        actorRef: requiredCatalogString(operationRow, 'actorRef'),
        operationName: requiredCatalogString(operationRow, 'operationName'),
        operationKey: requiredCatalogString(operationRow, 'key'),
        requestHash: brandNonEmpty(requiredCatalogString(operationRow, 'requestHash'), 'SourceHash'),
        resultRef: toolRefs[0],
        ...(operationRow.resultHash === undefined
          ? {}
          : { resultHash: brandNonEmpty(requiredCatalogString(operationRow, 'resultHash'), 'SourceHash') }),
      }]
}

export async function loadOfferingSourceState(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  operation?: Readonly<{ actorRef: string; operationName: string; operationKey: string }>,
): Promise<OfferingSourceState> {
  const offeringRows = await db.query('businessOfferings').withIndex('by_businessId_and_status', (query) => query.eq('businessId', businessId)).collect()
  const offerings = offeringRows.map((row) => ({
    offeringRef: brandNonEmpty(requiredCatalogString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredCatalogString(row, 'businessId'), 'BusinessId'),
    currentRevision: requiredCatalogNumber(row, 'currentRevision'),
    status: readCatalogStatus(row.status),
    createdAt: requiredCatalogNumber(row, 'createdAt'),
    updatedAt: requiredCatalogNumber(row, 'updatedAt'),
  }))
  const [revisionRows, pathRows] = await Promise.all([
    Promise.all(offerings.map((offering) => (
      db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) => (
          query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
        ))
        .unique()
    ))),
    Promise.all(offerings.map((offering) => (
      db.query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offering.offeringRef))
        .take(MAX_ACCESS_PATHS_PER_OFFERING + 1)
    ))),
  ])
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
  const toolRefs = readCatalogOperationRefs(operationRow)
  return {
    offerings,
    revisions: revisionRows.flatMap((row) => row === null ? [] : [readCatalogRevision(row)]),
    accessPaths: pathRows.flat().map(readCatalogAccessPath),
    operations: readCatalogOperation(operationRow, toolRefs),
  }
}

export async function persistOfferingSourceState(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  before: OfferingSourceState,
  after: OfferingSourceState,
  actorKind: 'owner' | 'system' = 'owner',
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
  await Promise.all(after.revisions.slice(before.revisions.length).map((revision) => db.insert('businessOfferingRevisions', {
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
  })))
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
  await Promise.all(after.operations.slice(before.operations.length).map((operation) => db.insert('operationKeys', {
    scope: 'catalog_offering',
    actorKind,
    actorRef: operation.actorRef,
    operationName: operation.operationName,
    key: operation.operationKey,
    requestHash: operation.requestHash,
    status: 'succeeded',
    effectRefs: [operation.resultRef],
    ...(operation.resultHash === undefined ? {} : { resultHash: operation.resultHash }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })))
  return { kind: 'ok' }
}
