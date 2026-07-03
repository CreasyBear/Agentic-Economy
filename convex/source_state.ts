import type { UserIdentity } from 'convex/server'

export type RuntimeDocument = Record<string, unknown> & { _id: string }

export type RuntimeIndexBuilder = {
  eq: (field: string, value: unknown) => RuntimeIndexBuilder
}

export type RuntimeQuery = {
  withIndex: (indexName: string, callback: (query: RuntimeIndexBuilder) => RuntimeIndexBuilder) => RuntimeQuery
  order?: (direction: 'asc' | 'desc') => RuntimeQuery
  take?: (limit: number) => Promise<RuntimeDocument[]>
  collect: () => Promise<RuntimeDocument[]>
  unique: () => Promise<RuntimeDocument | null>
  first?: () => Promise<RuntimeDocument | null>
}

export type RuntimeQueryable = {
  query: (tableName: string) => RuntimeQuery
}

export type RuntimeReader = RuntimeQueryable & {
  get: (id: string) => Promise<RuntimeDocument | null>
}

export type RuntimeWriter = RuntimeQueryable & {
  get?: (id: string) => Promise<RuntimeDocument | null>
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

export type RuntimeDb = RuntimeReader & RuntimeWriter

export type RuntimeAuth = {
  getUserIdentity: () => Promise<UserIdentity | null>
}

export type RuntimeQueryCtx = {
  db: RuntimeReader
}

export type RuntimeMutationCtx = {
  db: RuntimeDb
  auth: RuntimeAuth
}

export function runtimeReader(db: object): RuntimeReader {
  return db as RuntimeReader
}

export function runtimeWriter(db: object): RuntimeWriter {
  return db as RuntimeWriter
}

export function runtimeDb(db: object): RuntimeDb {
  return db as RuntimeDb
}

export function runtimeMutationCtx(ctx: { db: object; auth: RuntimeAuth }): RuntimeMutationCtx {
  return { db: runtimeDb(ctx.db), auth: ctx.auth }
}

type SourceRefRecord = {
  label: string
  evidenceRef: string
  sourceHash: string
}

type PhaseOneBusinessState = {
  owners: Record<string, unknown>[]
  businesses: Record<string, unknown>[]
  businessContexts: Record<string, unknown>[]
  claims: Record<string, unknown>[]
  claimFingerprints: Record<string, unknown>[]
  abuseRateLimitBuckets: Record<string, unknown>[]
}

type PhaseOneCatalogState = {
  businessServices: Record<string, unknown>[]
  serviceCapabilities: Record<string, unknown>[]
}

type PhaseOneRegistryState = {
  registryProjectionItems: Record<string, unknown>[]
  registryProjectionAttempts: Record<string, unknown>[]
  registrySearchDocuments?: Record<string, unknown>[]
  registrySearchSyncAttempts?: Record<string, unknown>[]
  indexStatus: Record<string, unknown>[]
}

type PhaseOneDiscoveryState = {
  discoveryManifests: Record<string, unknown>[]
  discoveryManifestAttempts: Record<string, unknown>[]
}

type PhaseOneSecurityState = {
  adminMemberships: Record<string, unknown>[]
  adminMembershipAuditEvents: Record<string, unknown>[]
  disputes: Record<string, unknown>[]
  suppressionRules: Record<string, unknown>[]
}

type PhaseOneObservabilityState = {
  operationKeys: Record<string, unknown>[]
  auditEvents: Record<string, unknown>[]
  operatorControls: Record<string, unknown>[]
  funnelEvents: Record<string, unknown>[]
  ownerActivationState: Record<string, unknown>[]
}

export type PhaseOneSourceState = {
  business: PhaseOneBusinessState
  catalog: PhaseOneCatalogState
  registry: PhaseOneRegistryState
  discovery: PhaseOneDiscoveryState
  security: PhaseOneSecurityState
  observability: PhaseOneObservabilityState
}

type UpsertSpec = {
  tableName: string
  rows: readonly Record<string, unknown>[]
  toPatch: (row: Record<string, unknown>) => Record<string, unknown>
  matches: (document: RuntimeDocument, row: Record<string, unknown>) => boolean
  lookup?: UpsertLookup
}

type UpsertLookup =
  | {
      kind: 'documentId'
      idField: string
    }
  | {
      kind: 'index'
      indexName: string
      fields: readonly string[]
    }

export async function loadPhaseOneSourceState(db: Pick<RuntimeDb, 'query'>): Promise<PhaseOneSourceState> {
  const [
    owners,
    businesses,
    businessContexts,
    claims,
    claimFingerprints,
    abuseRateLimitBuckets,
    businessServices,
    serviceCapabilities,
    registryProjectionItems,
    registryProjectionAttempts,
    registrySearchDocuments,
    registrySearchSyncAttempts,
    indexStatusRows,
    discoveryManifests,
    discoveryManifestAttempts,
    adminMemberships,
    adminMembershipAuditEvents,
    disputes,
    suppressionRules,
    operationKeys,
    auditEvents,
    operatorControls,
    funnelEvents,
    ownerActivationState,
  ] = await Promise.all([
    collect(db, 'owners'),
    collect(db, 'businesses'),
    collect(db, 'businessContexts'),
    collect(db, 'claims'),
    collect(db, 'claimFingerprints'),
    collect(db, 'abuseRateLimitBuckets'),
    collect(db, 'businessServices'),
    collect(db, 'serviceCapabilities'),
    collect(db, 'registryProjectionItems'),
    collect(db, 'registryProjectionAttempts'),
    collect(db, 'registrySearchDocuments'),
    collect(db, 'registrySearchSyncAttempts'),
    collect(db, 'indexStatus'),
    collect(db, 'discoveryManifests'),
    collect(db, 'discoveryManifestAttempts'),
    collect(db, 'adminMemberships'),
    collect(db, 'adminMembershipAuditEvents'),
    collect(db, 'disputes'),
    collect(db, 'suppressionRules'),
    collect(db, 'operationKeys'),
    collect(db, 'auditEvents'),
    collect(db, 'operatorControls'),
    collect(db, 'funnelEvents'),
    collect(db, 'ownerActivationState'),
  ])

  return {
    business: {
      owners: owners.map((row) => withDomainId(row, 'ownerId')),
      businesses: businesses.map((row) => withDomainId(row, 'businessId')),
      businessContexts: businessContexts.map(mapBusinessContext),
      claims: claims.map((row) => withDomainId(row, 'claimId')),
      claimFingerprints: claimFingerprints.map(stripConvexFields),
      abuseRateLimitBuckets: abuseRateLimitBuckets.map(stripConvexFields),
    },
    catalog: {
      businessServices: businessServices.map((row) => withDomainId(row, 'serviceId')),
      serviceCapabilities: serviceCapabilities.map(stripConvexFields),
    },
    registry: {
      registryProjectionItems: registryProjectionItems.map(stripConvexFields),
      registryProjectionAttempts: registryProjectionAttempts.map(stripConvexFields),
      registrySearchDocuments: registrySearchDocuments.map(stripConvexFields),
      registrySearchSyncAttempts: registrySearchSyncAttempts.map(stripConvexFields),
      indexStatus: indexStatusRows.map(stripConvexFields),
    },
    discovery: {
      discoveryManifests: discoveryManifests.map(stripConvexFields),
      discoveryManifestAttempts: discoveryManifestAttempts.map(stripConvexFields),
    },
    security: {
      adminMemberships: adminMemberships.map(stripConvexFields),
      adminMembershipAuditEvents: adminMembershipAuditEvents.map(stripConvexFields),
      disputes: disputes.map((row) => withDomainId(row, 'disputeId')),
      suppressionRules: suppressionRules.map(stripConvexFields),
    },
    observability: {
      operationKeys: operationKeys.map(mapOperationKey),
      auditEvents: auditEvents.map(mapAuditEvent),
      operatorControls: operatorControls.map(stripConvexFields),
      funnelEvents: funnelEvents.map(stripConvexFields),
      ownerActivationState: ownerActivationState.map(stripConvexFields),
    },
  }
}

export async function persistPhaseOneSourceState(db: RuntimeWriter, state: PhaseOneSourceState): Promise<void> {
  const specs: UpsertSpec[] = [
    byDomainId('owners', state.business.owners, 'ownerId'),
    byDomainId('businesses', state.business.businesses, 'businessId'),
    byFields('businessContexts', state.business.businessContexts, ['businessId']),
    byDomainId('claims', state.business.claims, 'claimId'),
    byFields('claimFingerprints', state.business.claimFingerprints, ['fingerprint', 'status']),
    byFields('abuseRateLimitBuckets', state.business.abuseRateLimitBuckets, ['scope', 'key', 'window']),
    byDomainId('businessServices', state.catalog.businessServices, 'serviceId'),
    byFields('serviceCapabilities', state.catalog.serviceCapabilities, ['businessId', 'serviceId', 'kind']),
    byFields('registryProjectionItems', state.registry.registryProjectionItems, ['logicalKey']),
    byFields('registryProjectionAttempts', state.registry.registryProjectionAttempts, ['logicalKey']),
    byFields('registrySearchDocuments', state.registry.registrySearchDocuments ?? [], ['documentId']),
    byFields('registrySearchSyncAttempts', state.registry.registrySearchSyncAttempts ?? [], ['attemptId']),
    byFields('indexStatus', state.registry.indexStatus, ['targetType', 'targetRef']),
    byFields('discoveryManifests', state.discovery.discoveryManifests, ['businessId', 'ucpVersion']),
    byFields('discoveryManifestAttempts', state.discovery.discoveryManifestAttempts, ['attemptId']),
    byFields('adminMemberships', state.security.adminMemberships, ['clerkUserId', 'state']),
    byFields('adminMembershipAuditEvents', state.security.adminMembershipAuditEvents, ['auditEventId']),
    byDomainId('disputes', state.security.disputes, 'disputeId'),
    byFields('suppressionRules', state.security.suppressionRules, ['targetType', 'targetRef', 'status']),
    byFieldsWithout('operationKeys', state.observability.operationKeys, ['actorRef', 'operationName', 'key'], ['operationKey']),
    byFieldsWithPatch('auditEvents', state.observability.auditEvents, ['eventId'], auditEventPatch),
    byFields('operatorControls', state.observability.operatorControls, ['key']),
    byFields('funnelEvents', state.observability.funnelEvents, ['eventId']),
    byFields('ownerActivationState', state.observability.ownerActivationState, ['businessId']),
  ]

  for (const spec of specs) {
    await upsertRows(db, spec)
  }
}

async function upsertRows(db: RuntimeWriter, spec: UpsertSpec): Promise<void> {
  for (const row of spec.rows) {
    const patch = spec.toPatch(row)
    const indexedExisting = await findExistingUpsertRow(db, spec, row)
    const existing = indexedExisting === undefined
      ? (await collect(db, spec.tableName)).find((document) => spec.matches(document, row))
      : indexedExisting
    if (existing === undefined || existing === null) {
      await db.insert(spec.tableName, patch)
    } else {
      await db.patch(existing._id, patch)
    }
  }
}

async function findExistingUpsertRow(
  db: RuntimeWriter,
  spec: UpsertSpec,
  row: Record<string, unknown>
): Promise<RuntimeDocument | null | undefined> {
  if (spec.lookup === undefined) {
    return undefined
  }

  const lookup = spec.lookup
  if (lookup.kind === 'documentId') {
    if (db.get === undefined) {
      return undefined
    }
    return await db.get(stringRecordField(row, lookup.idField))
  }

  if (!lookup.fields.every((field) => row[field] !== undefined)) {
    return undefined
  }

  return await db
    .query(spec.tableName)
    .withIndex(lookup.indexName, (builder) => lookup.fields.reduce((next, field) => next.eq(field, row[field]), builder))
    .unique()
}

function byDomainId(tableName: string, rows: readonly Record<string, unknown>[], idField: string): UpsertSpec {
  return {
    tableName,
    rows,
    toPatch: (row) => omitKeys(row, [idField]),
    matches: (document, row) => document._id === stringRecordField(row, idField),
    lookup: { kind: 'documentId', idField },
  }
}

function byFields(tableName: string, rows: readonly Record<string, unknown>[], fields: readonly string[]): UpsertSpec {
  const lookup = indexedUpsertLookup(tableName, fields)
  return {
    tableName,
    rows,
    toPatch: (row) => ({ ...row }),
    matches: (document, row) => fields.every((field) => document[field] === row[field]),
    ...(lookup === undefined ? {} : { lookup }),
  }
}

function byFieldsWithPatch(
  tableName: string,
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
  toPatch: (row: Record<string, unknown>) => Record<string, unknown>
): UpsertSpec {
  const lookup = indexedUpsertLookup(tableName, fields)
  return {
    tableName,
    rows,
    toPatch,
    matches: (document, row) => fields.every((field) => document[field] === row[field]),
    ...(lookup === undefined ? {} : { lookup }),
  }
}

function byFieldsWithout(
  tableName: string,
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
  omittedFields: readonly string[]
): UpsertSpec {
  const lookup = indexedUpsertLookup(tableName, fields)
  return {
    tableName,
    rows,
    toPatch: (row) => omitKeys(row, omittedFields),
    matches: (document, row) => fields.every((field) => document[field] === row[field]),
    ...(lookup === undefined ? {} : { lookup }),
  }
}

type IndexedUpsertLookup = Extract<UpsertLookup, { kind: 'index' }> & { tableName: string }

const indexedUpsertLookups: readonly IndexedUpsertLookup[] = [
  { kind: 'index', tableName: 'businessContexts', fields: ['businessId'], indexName: 'by_business' },
  { kind: 'index', tableName: 'claimFingerprints', fields: ['fingerprint', 'status'], indexName: 'by_fingerprint_status' },
  { kind: 'index', tableName: 'abuseRateLimitBuckets', fields: ['scope', 'key', 'window'], indexName: 'by_scope_key_window' },
  { kind: 'index', tableName: 'registryProjectionAttempts', fields: ['logicalKey'], indexName: 'by_logicalKey' },
  { kind: 'index', tableName: 'registrySearchDocuments', fields: ['documentId'], indexName: 'by_documentId' },
  { kind: 'index', tableName: 'registrySearchSyncAttempts', fields: ['attemptId'], indexName: 'by_attemptId' },
  { kind: 'index', tableName: 'discoveryManifests', fields: ['businessId', 'ucpVersion'], indexName: 'by_business_version' },
  { kind: 'index', tableName: 'adminMemberships', fields: ['clerkUserId', 'state'], indexName: 'by_clerkUserId_state' },
  { kind: 'index', tableName: 'suppressionRules', fields: ['targetType', 'targetRef', 'status'], indexName: 'by_target_status' },
  { kind: 'index', tableName: 'operationKeys', fields: ['actorRef', 'operationName', 'key'], indexName: 'by_actor_operation_key' },
  { kind: 'index', tableName: 'operatorControls', fields: ['key'], indexName: 'by_key' },
]

function indexedUpsertLookup(tableName: string, fields: readonly string[]): UpsertLookup | undefined {
  return indexedUpsertLookups.find((lookup) => lookup.tableName === tableName && sameFields(lookup.fields, fields))
}

function sameFields(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((field, index) => field === right[index])
}

async function collect(db: Pick<RuntimeDb, 'query'>, tableName: string): Promise<RuntimeDocument[]> {
  return db.query(tableName).collect()
}

function withDomainId(row: RuntimeDocument, idField: string): Record<string, unknown> {
  return {
    [idField]: row._id,
    ...stripConvexFields(row),
  }
}

function mapBusinessContext(row: RuntimeDocument): Record<string, unknown> {
  return {
    ...stripConvexFields(row),
    sourceRefs: sourceRefsField(row, 'sourceRefs'),
  }
}

function mapOperationKey(row: RuntimeDocument): Record<string, unknown> {
  return {
    operationKey: stringField(row, 'key'),
    ...stripConvexFields(row),
  }
}

function mapAuditEvent(row: RuntimeDocument): Record<string, unknown> {
  const stripped = stripConvexFields(row)
  return {
    ...omitKeys(stripped, ['redactedPayloadJson']),
    redactedPayload: parseJsonField(row, 'redactedPayloadJson'),
  }
}

function auditEventPatch(row: Record<string, unknown>): Record<string, unknown> {
  const redactedPayloadJson =
    typeof row.redactedPayloadJson === 'string' ? row.redactedPayloadJson : JSON.stringify(row.redactedPayload ?? null)
  return {
    ...omitKeys(row, ['redactedPayload', 'redactedPayloadJson']),
    redactedPayloadJson,
  }
}

function stripConvexFields(row: RuntimeDocument): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== '_id' && key !== '_creationTime')
  )
}

function omitKeys(row: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const omitted = new Set(keys)
  return Object.fromEntries(Object.entries(row).filter(([key]) => !omitted.has(key)))
}

function sourceRefsField(document: RuntimeDocument, field: string): SourceRefRecord[] {
  const refs = document[field]
  if (!Array.isArray(refs)) {
    return []
  }
  const sourceRefs: SourceRefRecord[] = []
  for (const ref of refs) {
    if (!isRecord(ref)) {
      continue
    }
    sourceRefs.push({
      label: stringFromRecord(ref, 'label'),
      evidenceRef: stringFromRecord(ref, 'evidenceRef'),
      sourceHash: stringFromRecord(ref, 'sourceHash'),
    })
  }
  return sourceRefs
}

function stringField(document: RuntimeDocument, field: string): string {
  const value = document[field]
  return typeof value === 'string' ? value : ''
}

function parseJsonField(document: RuntimeDocument, field: string): unknown {
  const value = document[field]
  if (typeof value !== 'string') {
    return null
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function stringRecordField(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  return typeof value === 'string' ? value : ''
}

function stringFromRecord(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
