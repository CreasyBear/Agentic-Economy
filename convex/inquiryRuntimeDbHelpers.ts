import type { RuntimeDb, RuntimeDocument, RuntimeQuery } from './source_state'

export async function upsertByFields(
  db: RuntimeDb,
  tableName: string,
  fields: readonly string[],
  patch: Record<string, unknown>
): Promise<void> {
  const indexedExisting = await findIndexedUpsertRow(db, tableName, fields, patch)
  const existing = indexedExisting === undefined
    ? (await collect(db, tableName)).find((row) => fields.every((field) => row[field] === patch[field]))
    : indexedExisting
  if (existing === undefined || existing === null) {
    await db.insert(tableName, patch)
    return
  }

  await db.patch(existing._id, patch)
}

type ExactUpsertIndex = {
  kind: 'exact'
  tableName: string
  fields: readonly string[]
  indexName: string
}

type ScopedUpsertIndex = {
  kind: 'scoped'
  tableName: string
  fields: readonly string[]
  indexName: string
  indexFields: readonly string[]
}

type UpsertIndex = ExactUpsertIndex | ScopedUpsertIndex

const upsertIndexes: readonly UpsertIndex[] = [
  { kind: 'exact', tableName: 'inquiryAbuseBuckets', fields: ['key', 'window'], indexName: 'by_key_window' },
  { kind: 'exact', tableName: 'inquiryThreads', fields: ['threadId'], indexName: 'by_threadId' },
  { kind: 'exact', tableName: 'inquiryMessages', fields: ['messageId'], indexName: 'by_messageId' },
  { kind: 'exact', tableName: 'inquiryNotifications', fields: ['notificationId'], indexName: 'by_notificationId' },
  { kind: 'exact', tableName: 'inquiryPrivacyTombstones', fields: ['threadId', 'operationKey'], indexName: 'by_thread_operationKey' },
  { kind: 'exact', tableName: 'notificationDispatches', fields: ['dispatchId'], indexName: 'by_dispatchId' },
  { kind: 'exact', tableName: 'inquiryCustomerAccessGrants', fields: ['accessId'], indexName: 'by_accessId' },
  { kind: 'scoped', tableName: 'auditEvents', fields: ['eventId'], indexName: 'by_correlationId', indexFields: ['correlationId'] },
  {
    kind: 'scoped',
    tableName: 'funnelEvents',
    fields: ['eventType', 'businessId', 'correlationId', 'createdAt'],
    indexName: 'by_business_createdAt',
    indexFields: ['businessId', 'createdAt'],
  },
]

async function findIndexedUpsertRow(
  db: RuntimeDb,
  tableName: string,
  fields: readonly string[],
  patch: Record<string, unknown>
): Promise<RuntimeDocument | null | undefined> {
  const index = upsertIndexes.find((candidate) => candidate.tableName === tableName && sameFields(candidate.fields, fields))
  if (index === undefined || !indexFieldsPresent(index, patch)) {
    return undefined
  }

  const indexFields = index.kind === 'exact' ? index.fields : index.indexFields
  const query = db.query(tableName).withIndex(index.indexName, (builder) =>
    indexFields.reduce((next, field) => next.eq(field, patch[field]), builder)
  )

  if (index.kind === 'exact') {
    return await query.unique()
  }

  return (await query.collect()).find((row) => fields.every((field) => row[field] === patch[field])) ?? null
}

function sameFields(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((field, index) => field === right[index])
}

function indexFieldsPresent(index: UpsertIndex, patch: Record<string, unknown>): boolean {
  const indexFields = index.kind === 'exact' ? index.fields : index.indexFields
  return indexFields.every((field) => patch[field] !== undefined)
}

export async function collect(db: Pick<RuntimeDb, 'query'>, tableName: string): Promise<RuntimeDocument[]> {
  return db.query(tableName).collect()
}

export async function takeRuntimeRows(query: RuntimeQuery, limit: number): Promise<RuntimeDocument[]> {
  return query.take === undefined ? (await query.collect()).slice(0, limit) : query.take(limit)
}

export function stringField(row: RuntimeDocument, field: string): string {
  const value = row[field]
  return typeof value === 'string' ? value : ''
}

export function optionalStringField(row: RuntimeDocument, field: string): string | undefined {
  const value = row[field]
  return typeof value === 'string' ? value : undefined
}

export function numberField(row: RuntimeDocument, field: string): number {
  const value = row[field]
  return typeof value === 'number' ? value : 0
}

export function optionalNumberField(row: RuntimeDocument, field: string): number | undefined {
  const value = row[field]
  return typeof value === 'number' ? value : undefined
}

export function booleanField(row: RuntimeDocument, field: string): boolean {
  return row[field] === true
}

export function arrayField(row: RuntimeDocument, field: string): unknown[] | undefined {
  const value = row[field]
  return Array.isArray(value) ? value : undefined
}

export function stringArrayField(row: RuntimeDocument, field: string): string[] {
  return (arrayField(row, field) ?? []).filter(isString)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stringFromUnknown(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function optionalNumberFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
