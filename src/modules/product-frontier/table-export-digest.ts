import { canonicalDigest } from '@/modules/common/canonical-digest'
import { INQUIRY_EXPORT_TABLES, P6_CLOSEOUT_EXPORT_TABLES } from './table-export-tables'

export { INQUIRY_EXPORT_TABLES, P6_CLOSEOUT_EXPORT_TABLES }
export const P6_TABLE_EXPORT_SCHEMA_VERSION = 'ae-p6-table-export:v1' as const

export type InquiryExportTable = (typeof INQUIRY_EXPORT_TABLES)[number]

export type TableExportClassification = 'full-digest' | 'hash-only' | 'unmeasured'
export type TableExportDeployment = 'unavailable' | 'observed'

const HASH_ONLY_OMIT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  governedSendReceiptKeys: ['wrappedKeyBase64', 'wrapIvBase64'],
}

export type TableExportEntry = Readonly<{
  table: string
  count: number | 'unmeasured'
  sha256: string | null
  classification: TableExportClassification
}>

export type TableExportManifest = Readonly<{
  schemaVersion: typeof P6_TABLE_EXPORT_SCHEMA_VERSION
  capturedAt: string
  evidenceClass: 'source-local'
  deployment: TableExportDeployment
  tables: readonly TableExportEntry[]
}>

export function classificationForTable(table: string): Exclude<TableExportClassification, 'unmeasured'> {
  return table in HASH_ONLY_OMIT_FIELDS ? 'hash-only' : 'full-digest'
}

export function omitSecretFields(
  table: string,
  row: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const omit = new Set(HASH_ONLY_OMIT_FIELDS[table] ?? [])
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (omit.has(key) || value === undefined) continue
    next[key] = value
  }
  return next
}

export function digestTableRows(
  table: string,
  rows: readonly Readonly<Record<string, unknown>>[],
): TableExportEntry {
  const classification = classificationForTable(table)
  const rowDigests = rows
    .map((row) => canonicalDigest(omitSecretFields(table, row)))
    .slice()
    .sort()
  let fold = canonicalDigest({ table, seed: 0 })
  for (const rowDigest of rowDigests) {
    fold = canonicalDigest({ prev: fold, row: rowDigest })
  }
  return {
    table,
    count: rows.length,
    sha256: canonicalDigest({ table, count: rows.length, fold }),
    classification,
  }
}

export function unmeasuredTableEntry(table: string): TableExportEntry {
  return {
    table,
    count: 'unmeasured',
    sha256: null,
    classification: 'unmeasured',
  }
}

export function buildUnmeasuredInquiryExportManifest(capturedAt: string): TableExportManifest {
  return {
    schemaVersion: P6_TABLE_EXPORT_SCHEMA_VERSION,
    capturedAt,
    evidenceClass: 'source-local',
    deployment: 'unavailable',
    tables: INQUIRY_EXPORT_TABLES.map(unmeasuredTableEntry),
  }
}

export function buildUnmeasuredCloseoutExportManifest(capturedAt: string): TableExportManifest {
  return {
    schemaVersion: P6_TABLE_EXPORT_SCHEMA_VERSION,
    capturedAt,
    evidenceClass: 'source-local',
    deployment: 'unavailable',
    tables: P6_CLOSEOUT_EXPORT_TABLES.map(unmeasuredTableEntry),
  }
}
