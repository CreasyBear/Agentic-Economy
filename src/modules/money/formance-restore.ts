"use node"

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { schemaDescriptorDigest } from '@/modules/common/canonical-digest'
import {
  createFormanceContext, NO_RETRY, type FormanceConfiguration,
} from './internal/formance-config'

export type FormanceRestoreJsonValue = null | boolean | number | string
  | readonly FormanceRestoreJsonValue[] | FormanceRestoreJsonObject
export type FormanceRestoreJsonObject = { readonly [key: string]: FormanceRestoreJsonValue }
type JsonObject = Record<string, FormanceRestoreJsonValue>
export type FormanceRestoreSnapshot = Readonly<{
  summary: Readonly<{
    ledger: string
    counts: Readonly<{ transactions: number; accounts: number; schemas: number }>
    digests: Readonly<{ ledger: string; transactions: string; accounts: string; schemas: string }>
  }>
  transactions: readonly FormanceRestoreJsonObject[]
  accounts: readonly FormanceRestoreJsonObject[]
  schemas: readonly FormanceRestoreJsonObject[]
  ledgerData: FormanceRestoreJsonObject
}>
export type FormanceRestoreSnapshotResult = Readonly<{ kind: 'available'; snapshot: FormanceRestoreSnapshot }>
  | Readonly<{ kind: 'unavailable'; code: string }>

const PAGE_SIZE = 250
const MAX_ROWS = 100_000
const MAX_SCHEMAS = 1_000
const MAX_PAGE_BYTES = 8 * 1024 * 1024
const MAX_JSON_DEPTH = 64
const MAX_JSON_NODES = 1_000_000
const SCAN_TIMEOUT_MS = 120_000
const REQUEST_TIMEOUT_MS = 5_000

class RestoreReadError extends Error {
  constructor(readonly code: string) { super(code) }
}
function refuse(code = 'formance_restore_response_invalid'): never { throw new RestoreReadError(code) }
function object(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) refuse()
  return value as JsonObject
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100_000) refuse()
  return value
}
function timestamp(value: unknown): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || !Number.isFinite(Date.parse(value))) refuse()
}
function optionalClocks(row: JsonObject, fields: readonly string[]): void {
  for (const key of fields) if (row[key] !== undefined && row[key] !== null) timestamp(row[key])
}
function strings(value: unknown): void {
  for (const entry of Object.values(object(value))) if (typeof entry !== 'string') refuse()
}
function integer(value: unknown, signed = false): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (!signed && value < 0)) {
    refuse('formance_restore_numeric_precision_unsupported')
  }
  return BigInt(value).toString()
}
/** Node 22 supplies the original token before an unsafe decimal can round to a safe integer. */
function parseRawJson(body: string): unknown {
  return JSON.parse(body, (_key: string, value: unknown, context?: { source?: string }): unknown => {
    if (typeof value === 'number') {
      const source = context?.source
      if (source === undefined || !/^-?(?:0|[1-9]\d*)$/u.test(source) || !Number.isSafeInteger(value)
        || BigInt(source) !== BigInt(value)) refuse('formance_restore_numeric_precision_unsupported')
    }
    return value
  }) as unknown
}
/** Validate before canonical hashing; unknown native JSON fields participate too. */
function validateJson(value: unknown): void {
  let nodes = 0
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) refuse('formance_restore_json_limit_exceeded')
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) refuse('formance_restore_numeric_precision_unsupported')
      return
    }
    if (Array.isArray(item)) { for (const child of item) visit(child, depth + 1); return }
    for (const child of Object.values(object(item))) visit(child, depth + 1)
  }
  visit(value, 0)
}
function normalizeVolumes(value: unknown): JsonObject {
  return Object.fromEntries(Object.entries(object(value)).map(([asset, raw]) => {
    text(asset)
    const volume = object(raw)
    const input = integer(volume.input); const output = integer(volume.output); const balance = integer(volume.balance, true)
    if (BigInt(input) - BigInt(output) !== BigInt(balance)) refuse()
    return [asset, { ...volume, input, output, balance }]
  }))
}
function normalizeTransaction(raw: unknown): JsonObject {
  const row = object(raw)
  timestamp(row.timestamp)
  timestamp(row.insertedAt)
  optionalClocks(row, ['updatedAt', 'revertedAt'])
  if (typeof row.reverted !== 'boolean' || (row.reverted && row.revertedAt == null)) refuse()
  strings(row.metadata)
  if (row.reference !== undefined) text(row.reference)
  if (row.template !== undefined) text(row.template)
  if (row.schemaVersion !== undefined) text(row.schemaVersion)
  if (!Array.isArray(row.postings)) refuse()
  const normalized: JsonObject = { ...row, id: integer(row.id), postings: row.postings.map(rawPosting => {
    const posting = object(rawPosting)
    text(posting.source); text(posting.destination); text(posting.asset)
    return { ...posting, amount: integer(posting.amount) }
  }) }
  for (const key of ['preCommitVolumes', 'postCommitVolumes', 'preCommitEffectiveVolumes', 'postCommitEffectiveVolumes']) {
    if (row[key] !== undefined) normalized[key] = Object.fromEntries(
      Object.entries(object(row[key])).map(([address, volumes]) => { text(address); return [address, normalizeVolumes(volumes)] }),
    )
  }
  return normalized
}
function normalizeAccount(raw: unknown): JsonObject {
  const row = object(raw)
  text(row.address)
  strings(row.metadata)
  optionalClocks(row, ['firstUsage', 'insertionDate', 'updatedAt'])
  // Expanded volumes are mandatory evidence, including a real empty map for an unused account.
  return { ...row, volumes: normalizeVolumes(row.volumes), effectiveVolumes: normalizeVolumes(row.effectiveVolumes) }
}
function normalizeSchema(raw: unknown): JsonObject {
  const row = object(raw)
  text(row.version); timestamp(row.createdAt); object(row.chart)
  if (row.queries !== undefined) object(row.queries)
  if (row.transactions !== undefined) {
    for (const rawTemplate of Object.values(object(row.transactions))) text(object(rawTemplate).script)
  }
  return row
}
function normalizeLedger(raw: unknown, ledger: string): JsonObject {
  const row = object(raw)
  if (row.name !== ledger) refuse('formance_restore_ledger_identity_mismatch')
  text(row.bucket); timestamp(row.addedAt)
  optionalClocks(row, ['deletedAt'])
  if (row.features !== undefined) strings(row.features)
  if (row.metadata !== undefined) strings(row.metadata)
  return row.id === undefined ? row : { ...row, id: integer(row.id) }
}
function abortRace<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(new RestoreReadError('formance_restore_read_timeout'))
    }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)).catch(() => undefined)
  })
}

/** Complete financial-state evidence only. Callers must separately establish writer quiescence. */
export async function readFormanceRestoreSnapshot(configuration: FormanceConfiguration): Promise<FormanceRestoreSnapshotResult> {
  const startedAt = Date.now()
  const signal = AbortSignal.timeout(SCAN_TIMEOUT_MS)
  let captured: JsonObject | undefined
  let captureFailure: string | undefined
  try {
    const context = createFormanceContext({ ...configuration, requestTimeoutMs: REQUEST_TIMEOUT_MS }, {
      signal,
      observeResponse: async (response, request) => {
        if (request.method !== 'GET' || response.status !== 200 || captured !== undefined) refuse()
        const clone = response.clone()
        const cancel = () => { void response.body?.cancel().catch(() => undefined) }
        request.signal.addEventListener('abort', cancel, { once: true })
        try {
          const bounded = await abortRace(readBoundedRequestText(clone, MAX_PAGE_BYTES), request.signal)
          if (!bounded.ok) refuse('formance_restore_page_size_exceeded')
          const parsed = parseRawJson(bounded.text)
          validateJson(parsed)
          captured = object(parsed)
        } catch (error) {
          captureFailure = error instanceof RestoreReadError ? error.code : 'formance_restore_response_invalid'
          throw error
        } finally { request.signal.removeEventListener('abort', cancel) }
      },
    })
    const read = async <Result>(operation: () => Promise<Result>): Promise<JsonObject> => {
      if (Date.now() - startedAt >= SCAN_TIMEOUT_MS) refuse('formance_restore_read_timeout')
      captured = undefined
      await abortRace(operation(), signal)
      if (captured === undefined) refuse()
      return captured
    }
    const ledger = configuration.ledger
    const ledgerData = normalizeLedger((await read(() => context.sdk.ledger.v2.getLedger({ ledger }, NO_RETRY))).data, ledger)
    let totalRows = 0
    const scan = async (
      category: 'transactions' | 'accounts' | 'schemas', normalize: (row: unknown) => JsonObject, identity: string,
    ): Promise<JsonObject[]> => {
      const rows: JsonObject[] = []
      const identities = new Set<string>()
      const references = new Set<string>()
      const cursors = new Set<string>()
      let cursor: string | undefined
      for (;;) {
        const payload = await read(() => {
          if (category === 'transactions') return context.sdk.ledger.v2.listTransactions(
            cursor === undefined ? { ledger, pageSize: PAGE_SIZE, sort: 'id:asc' } : { ledger, cursor }, NO_RETRY,
          )
          if (category === 'accounts') return context.sdk.ledger.v2.listAccounts(
            cursor === undefined ? { ledger, pageSize: PAGE_SIZE, sort: 'address:asc', expand: 'volumes,effectiveVolumes' } : { ledger, cursor }, NO_RETRY,
          )
          return context.sdk.ledger.v2.listSchemas(
            cursor === undefined ? { ledger, pageSize: PAGE_SIZE, sort: 'created_at', order: 'asc' } : { ledger, cursor }, NO_RETRY,
          )
        })
        const page = object(payload.cursor)
        if (!Array.isArray(page.data) || page.data.length > PAGE_SIZE || typeof page.hasMore !== 'boolean'
          || !Number.isSafeInteger(page.pageSize) || Number(page.pageSize) < 1 || Number(page.pageSize) > PAGE_SIZE) refuse()
        for (const raw of page.data) {
          if (++totalRows > MAX_ROWS || (category === 'schemas' && rows.length >= MAX_SCHEMAS)) refuse('formance_restore_row_limit_exceeded')
          const row = normalize(raw)
          const key = text(row[identity])
          if (identities.has(key)) refuse('formance_restore_duplicate_identity')
          identities.add(key)
          if (category === 'transactions' && row.reference !== undefined) {
            const reference = text(row.reference)
            if (references.has(reference)) refuse('formance_restore_duplicate_reference')
            references.add(reference)
          }
          rows.push(row)
        }
        if (!page.hasMore) break
        if (page.data.length === 0 || typeof page.next !== 'string' || page.next.length === 0 || page.next.length > 8_192
          || cursors.has(page.next)) refuse('formance_restore_cursor_invalid')
        cursors.add(page.next)
        cursor = page.next
      }
      return rows.sort((left, right) => {
        const a = text(left[identity]); const b = text(right[identity])
        if (category === 'transactions') return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0
        return a < b ? -1 : a > b ? 1 : 0
      })
    }
    const transactions = await scan('transactions', normalizeTransaction, 'id')
    const accounts = await scan('accounts', normalizeAccount, 'address')
    const schemas = await scan('schemas', normalizeSchema, 'version')
    signal.throwIfAborted()
    const snapshot: FormanceRestoreSnapshot = {
      summary: { ledger, counts: { transactions: transactions.length, accounts: accounts.length, schemas: schemas.length },
        digests: { ledger: schemaDescriptorDigest(ledgerData), transactions: schemaDescriptorDigest(transactions),
          accounts: schemaDescriptorDigest(accounts), schemas: schemaDescriptorDigest(schemas) } },
      ledgerData, transactions, accounts, schemas,
    }
    if (Date.now() - startedAt >= SCAN_TIMEOUT_MS) refuse('formance_restore_read_timeout')
    return { kind: 'available', snapshot }
  } catch (error) {
    return { kind: 'unavailable', code: captureFailure ?? (error instanceof RestoreReadError ? error.code
      : signal.aborted ? 'formance_restore_read_timeout' : 'formance_restore_read_failed') }
  }
}
