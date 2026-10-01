import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { jsonToConvex } from 'convex/values'

export type ConvexSnapshotDiagnosticCode =
  | 'snapshot_limits_invalid' | 'snapshot_archive_unreadable' | 'snapshot_archive_changed'
  | 'snapshot_archive_too_large' | 'snapshot_timeout' | 'snapshot_command_failed'
  | 'snapshot_output_limit' | 'snapshot_member_limit' | 'snapshot_member_path_invalid'
  | 'snapshot_duplicate_member' | 'snapshot_member_conflict' | 'snapshot_data_missing' | 'snapshot_table_data_missing'
  | 'snapshot_table_census_missing' | 'snapshot_table_unmapped' | 'snapshot_schema_invalid'
  | 'snapshot_utf8_invalid' | 'snapshot_json_invalid' | 'snapshot_record_invalid'
  | 'snapshot_duplicate_record' | 'snapshot_record_limit' | 'snapshot_schema_without_data'
  | 'snapshot_storage_metadata_invalid' | 'snapshot_storage_file_missing'
  | 'snapshot_storage_metadata_missing' | 'snapshot_storage_size_mismatch'
  | 'snapshot_storage_checksum_mismatch' | 'snapshot_table_mismatch'
  | 'snapshot_identity_mismatch' | 'snapshot_content_mismatch' | 'snapshot_schema_mismatch'
  | 'snapshot_storage_mismatch' | 'snapshot_member_mismatch'

/** Deliberately excludes document content, subprocess output and archive filenames. */
export class ConvexSnapshotDiagnostic extends Error {
  constructor(readonly code: ConvexSnapshotDiagnosticCode, readonly path?: string) {
    super(path === undefined ? code : `${code}:${path}`)
    this.name = 'ConvexSnapshotDiagnostic'
  }
}

export interface ConvexSnapshotLimits {
  maxArchiveBytes: number
  maxMemberBytes: number
  maxTotalBytes: number
  maxMembers: number
  maxDocuments: number
  maxLineBytes: number
  maxCommandOutputBytes: number
  timeoutMs: number
  commandTimeoutMs: number
}

const DEFAULT_LIMITS: ConvexSnapshotLimits = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxMemberBytes: 128 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxMembers: 20_000,
  maxDocuments: 1_000_000,
  maxLineBytes: 8 * 1024 * 1024,
  maxCommandOutputBytes: 16 * 1024 * 1024,
  timeoutMs: 120_000,
  commandTimeoutMs: 30_000,
}

export interface ConvexSnapshotTable {
  path: string
  count: number
  identityDigest: string
  contentDigest: string
  schemaDigest: string | null
}

export interface ConvexSnapshotStorageFile { path: string; bytes: number; SHA256: string }
export interface ConvexSnapshotMember {
  path: string
  kind: 'documents' | 'schema' | 'storage' | 'metadata' | 'directory'
  bytes: number
  SHA256: string
  /** Structured members use canonical JSONL, others use exact bytes. */
  contentDigest: string
}

export interface ConvexSnapshotManifest {
  version: 1
  scope: 'records_and_files'
  archiveSHA256: string
  counts: { tables: number; documents: number; files: number; members: number }
  tables: readonly ConvexSnapshotTable[]
  storageFiles: readonly ConvexSnapshotStorageFile[]
  members: readonly ConvexSnapshotMember[]
  digests: { tables: string; storage: string; members: string }
}

export interface ConvexSnapshotComparison {
  version: 1
  scope: 'records_and_files'
  kind: 'matched'
  sourceArchiveSHA256: string
  restoredArchiveSHA256: string
  counts: ConvexSnapshotManifest['counts']
  digests: ConvexSnapshotManifest['digests']
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }
interface ReadBudget { limits: ConvexSnapshotLimits; deadline: number; totalBytes: number; documents: number }
interface TableRecords { path: string; rows: JsonObject[]; schemaDigest: string | null }
interface ParsedLine { value: JsonValue; canonical: string }
// Parsed values remain ordinary JS for validation. Wire number provenance is private,
// attached to the original containing object so user strings cannot collide with it.
const numberSources = new WeakMap<object, Map<string, string>>()

function refuse(code: ConvexSnapshotDiagnosticCode, path?: string): never {
  throw new ConvexSnapshotDiagnostic(code, path)
}

function limitsFrom(input: Partial<ConvexSnapshotLimits>): ConvexSnapshotLimits {
  if (Object.keys(input).some(key => !(key in DEFAULT_LIMITS))) refuse('snapshot_limits_invalid')
  const limits = { ...DEFAULT_LIMITS, ...input }
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0)) {
    refuse('snapshot_limits_invalid')
  }
  return limits
}

function remaining(budget: ReadBudget): number {
  const milliseconds = budget.deadline - Date.now()
  if (milliseconds <= 0) refuse('snapshot_timeout')
  return milliseconds
}

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const digest = (value: JsonValue): string => sha256(canonical(value))

function canonical(value: JsonValue, depth = 0, numberSource?: string): string {
  if (depth > 128) refuse('snapshot_json_invalid')
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) refuse('snapshot_json_invalid')
    if (numberSource !== undefined && Object.is(value, -0)) return 'f:-0'
    if (numberSource !== undefined && /^-?(0|[1-9]\d*)$/u.test(numberSource)) {
      return `i:${BigInt(numberSource).toString()}`
    }
    // Uniform exports distinguish raw int64 tokens from f64 tokens with a dot/exponent.
    // Equivalent float spellings normalize to the same IEEE value; signed zero survives.
    return `${numberSource === undefined ? 'n' : 'f'}:${Object.is(value, -0) ? '-0' : JSON.stringify(value)}`
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  const sources = numberSources.get(value)
  if (Array.isArray(value)) return `[${value.map((item, index) => canonical(item, depth + 1, sources?.get(String(index)))).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!, depth + 1, sources?.get(key))}`).join(',')}}`
}

function text(bytes: Buffer, path?: string): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return refuse('snapshot_utf8_invalid', path) }
}

/** Uses argument arrays and never extracts. Both output streams and runtime are bounded. */
async function unzip(args: readonly string[], budget: ReadBudget, outputLimit: number, path?: string,
  capture = true): Promise<Buffer> {
  const timeout = Math.min(remaining(budget), budget.limits.commandTimeoutMs)
  return await new Promise((resolvePromise, reject) => {
    const child = spawn('/usr/bin/unzip', [...args], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { LC_ALL: 'C', LANG: 'C' },
    })
    const chunks: Buffer[] = []
    let outputBytes = 0
    let errorBytes = 0
    let failure: ConvexSnapshotDiagnostic | undefined
    const fail = (code: ConvexSnapshotDiagnosticCode): void => {
      failure ??= new ConvexSnapshotDiagnostic(code, path)
      child.kill('SIGKILL')
    }
    const timer = setTimeout(() => fail('snapshot_timeout'), timeout)
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > outputLimit) fail('snapshot_output_limit')
      else if (capture) chunks.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      errorBytes += chunk.length
      if (errorBytes > budget.limits.maxCommandOutputBytes) fail('snapshot_output_limit')
    })
    child.once('error', () => { failure ??= new ConvexSnapshotDiagnostic('snapshot_command_failed', path) })
    child.once('close', status => {
      clearTimeout(timer)
      if (failure !== undefined) reject(failure)
      else if (status !== 0) reject(new ConvexSnapshotDiagnostic('snapshot_command_failed', path))
      else resolvePromise(capture ? Buffer.concat(chunks, outputBytes) : Buffer.alloc(0))
    })
  })
}

async function archiveDigest(path: string, budget: ReadBudget): Promise<string> {
  try {
    const info = await stat(path)
    if (!info.isFile()) refuse('snapshot_archive_unreadable')
    if (info.size > budget.limits.maxArchiveBytes) refuse('snapshot_archive_too_large')
    const hash = createHash('sha256')
    let bytes = 0
    const stream = createReadStream(path, { signal: AbortSignal.timeout(remaining(budget)) })
    for await (const chunk of stream) {
      bytes += (chunk as Buffer).length
      if (bytes > budget.limits.maxArchiveBytes) refuse('snapshot_archive_too_large')
      hash.update(chunk as Buffer)
    }
    return hash.digest('hex')
  } catch (error) {
    if (error instanceof ConvexSnapshotDiagnostic) throw error
    if (Date.now() >= budget.deadline || (error instanceof Error && error.name === 'AbortError')) refuse('snapshot_timeout')
    return refuse('snapshot_archive_unreadable')
  }
}

function safeMemberPath(path: string): boolean {
  if (path.length === 0 || path.length > 512 || /[\u0000-\u001f\u007f\\*?\[\]]/u.test(path)) return false
  if (path.startsWith('/') || /^[a-z]:/iu.test(path)) return false
  const parts = (path.endsWith('/') ? path.slice(0, -1) : path).split('/')
  return parts.every(part => part !== '' && part !== '.' && part !== '..' && !part.startsWith('-'))
}

function memberPaths(output: Buffer, budget: ReadBudget): string[] {
  const listing = text(output)
  if (!listing.endsWith('\n')) refuse('snapshot_member_path_invalid')
  const paths = listing.slice(0, -1).split('\n')
  if (paths.length > budget.limits.maxMembers) refuse('snapshot_member_limit')
  const seen = new Set<string>()
  for (const path of paths) {
    if (!safeMemberPath(path)) refuse('snapshot_member_path_invalid')
    if (seen.has(path)) refuse('snapshot_duplicate_member', path)
    seen.add(path)
  }
  for (const path of paths) {
    if (path.endsWith('/')) continue
    if (seen.has(`${path}/`)) refuse('snapshot_member_conflict', path)
    const parts = path.split('/')
    while (parts.length > 1) {
      parts.pop()
      if (seen.has(parts.join('/'))) refuse('snapshot_member_conflict', path)
    }
  }
  return paths.sort()
}

function parseLines(bytes: Buffer, path: string, budget: ReadBudget): ParsedLine[] {
  const contents = text(bytes, path)
  if (contents === '') return []
  const lines = contents.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const result: ParsedLine[] = []
  for (const line of lines) {
    if (Buffer.byteLength(line) > budget.limits.maxLineBytes) refuse('snapshot_output_limit', path)
    let value: JsonValue
    let rootNumberSource: string | undefined
    try {
      value = JSON.parse(line, function (this: object, key: string, parsed: unknown, context?: { source?: string }) {
        if (typeof parsed === 'number') {
          if (context?.source === undefined) refuse('snapshot_json_invalid', path)
          let sources = numberSources.get(this)
          if (sources === undefined) { sources = new Map(); numberSources.set(this, sources) }
          sources.set(key, context.source)
          if (key === '') rootNumberSource = context.source
        }
        return parsed
      }) as JsonValue
    }
    catch { return refuse('snapshot_json_invalid', path) }
    // Validate recursion/numbers before accepting or hashing any native extended JSON value.
    let representation: string
    try { representation = canonical(value, 0, rootNumberSource) }
    catch { return refuse('snapshot_json_invalid', path) }
    result.push({ value, canonical: representation })
  }
  return result
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function records(bytes: Buffer, path: string, budget: ReadBudget): JsonObject[] {
  const rows: JsonObject[] = []
  const ids = new Set<string>()
  for (const { value } of parseLines(bytes, path, budget)) {
    if (!isObject(value) || typeof value._id !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/u.test(value._id)
      || typeof value._creationTime !== 'number' || !Number.isFinite(value._creationTime) || value._creationTime < 0) {
      refuse('snapshot_record_invalid', path)
    }
    if (ids.has(value._id)) refuse('snapshot_duplicate_record', path)
    // Native plain/schema-directed fields stay unchanged. Reserved transport encodings,
    // when present, must also be valid maintained Convex values; never hash malformed tags.
    try { jsonToConvex(value) }
    catch { return refuse('snapshot_record_invalid', path) }
    ids.add(value._id)
    rows.push(value)
    budget.documents++
    if (budget.documents > budget.limits.maxDocuments) refuse('snapshot_record_limit', path)
  }
  return rows.sort((left, right) => (left._id as string) < (right._id as string) ? -1 : 1)
}

/** Native _tables rows identify tables; they are not ordinary Convex documents. */
function tableMappings(bytes: Buffer, path: string, budget: ReadBudget): JsonObject[] {
  const rows: JsonObject[] = []
  const names = new Set<string>()
  const ids = new Set<number>()
  for (const { value } of parseLines(bytes, path, budget)) {
    if (!isObject(value) || typeof value.name !== 'string' || !/^[a-zA-Z0-9_]{1,256}$/u.test(value.name)
      || typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id < 0) refuse('snapshot_record_invalid', path)
    if (names.has(value.name) || ids.has(value.id)) refuse('snapshot_duplicate_record', path)
    names.add(value.name)
    ids.add(value.id)
    rows.push(value)
    budget.documents++
    if (budget.documents > budget.limits.maxDocuments) refuse('snapshot_record_limit', path)
  }
  return rows.sort((left, right) => (left.name as string) < (right.name as string) ? -1 : 1)
}

function parent(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}
function filename(path: string): string { return path.slice(path.lastIndexOf('/') + 1) }

function validateStorage(tables: ReadonlyMap<string, TableRecords>, members: readonly ConvexSnapshotMember[]): ConvexSnapshotStorageFile[] {
  const files: ConvexSnapshotStorageFile[] = []
  const metadata = new Map<string, JsonObject>()
  for (const table of tables.values()) {
    if (filename(table.path) !== '_storage') continue
    for (const row of table.rows) {
      if (typeof row.size !== 'number' || !Number.isSafeInteger(row.size) || row.size < 0 || typeof row.sha256 !== 'string') {
        refuse('snapshot_storage_metadata_invalid', `${table.path}/documents.jsonl`)
      }
      metadata.set(`${table.path}/${row._id as string}`, row)
    }
  }
  for (const member of members) {
    if (member.kind !== 'storage') continue
    const basename = filename(member.path)
    // Native exports append a media-type extension (e.g. .csv/.html) when known.
    const separator = basename.indexOf('.')
    const id = separator < 0 ? basename : basename.slice(0, separator)
    if (separator >= 0 && !/^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$/u.test(basename.slice(separator + 1))) {
      refuse('snapshot_member_path_invalid', member.path)
    }
    const identityPath = `${parent(member.path)}/${id}`
    const row = metadata.get(identityPath)
    if (row === undefined) refuse('snapshot_storage_metadata_missing', member.path)
    if (row.size !== member.bytes) refuse('snapshot_storage_size_mismatch', member.path)
    const expected = row.sha256 as string
    const hex = Buffer.from(member.SHA256, 'hex')
    if (expected !== member.SHA256 && expected !== hex.toString('base64')) {
      refuse('snapshot_storage_checksum_mismatch', member.path)
    }
    metadata.delete(identityPath)
    files.push({ path: member.path, bytes: member.bytes, SHA256: member.SHA256 })
  }
  const missing = metadata.keys().next().value as string | undefined
  if (missing !== undefined) refuse('snapshot_storage_file_missing', missing)
  return files
}

/** Complete bounded native archive read; no provenance or scheduler recovery claim. */
export async function readConvexSnapshot(archivePath: string, optionalLimits: Partial<ConvexSnapshotLimits> = {}): Promise<ConvexSnapshotManifest> {
  const limits = limitsFrom(optionalLimits)
  const budget: ReadBudget = { limits, deadline: Date.now() + limits.timeoutMs, totalBytes: 0, documents: 0 }
  const absolutePath = resolve(archivePath)
  const archiveSHA256 = await archiveDigest(absolutePath, budget)
  const paths = memberPaths(await unzip(['-Z1', absolutePath], budget, limits.maxCommandOutputBytes), budget)
  // Validate CRCs and the complete central-directory inventory, not merely requested members.
  await unzip(['-t', absolutePath], budget, limits.maxCommandOutputBytes, undefined, false)
  const tables = new Map<string, TableRecords>()
  const schemas = new Map<string, string>()
  const members: ConvexSnapshotMember[] = []
  for (const path of paths) {
    remaining(budget)
    const bytes = await unzip(['-p', absolutePath, path], budget,
      Math.min(limits.maxMemberBytes, limits.maxTotalBytes - budget.totalBytes), path)
    budget.totalBytes += bytes.length
    let kind: ConvexSnapshotMember['kind'] = path.endsWith('/') ? 'directory' : 'metadata'
    let contentDigest = sha256(bytes)
    if (kind === 'directory') {
      if (bytes.length !== 0) refuse('snapshot_member_conflict', path)
    } else if (filename(path) === 'documents.jsonl') {
      const tablePath = parent(path)
      if (tablePath === '') refuse('snapshot_member_path_invalid', path)
      const rows = filename(tablePath) === '_tables' ? tableMappings(bytes, path, budget) : records(bytes, path, budget)
      tables.set(tablePath, { path: tablePath, rows, schemaDigest: null })
      kind = 'documents'
      contentDigest = digest(rows)
    } else if (filename(path) === 'generated_schema.jsonl') {
      const lines = parseLines(bytes, path, budget)
      if (typeof lines[0]?.value !== 'string' || lines[0].value.length === 0) refuse('snapshot_schema_invalid', path)
      // The native parser consumes the first line as Shape/uniform, then legacy
      // document-context overrides. Line order is part of the archive's meaning.
      const canonicalLines = lines.map(line => line.canonical)
      contentDigest = digest(canonicalLines)
      schemas.set(parent(path), contentDigest)
      kind = 'schema'
    } else if (filename(parent(path)) === '_storage') {
      kind = 'storage'
    }
    members.push({ path, kind, bytes: bytes.length, SHA256: sha256(bytes), contentDigest })
  }
  if (tables.size === 0) refuse('snapshot_data_missing')
  if (!tables.has('_tables')) refuse('snapshot_table_census_missing', '_tables/documents.jsonl')
  for (const table of tables.values()) {
    const namespace = parent(table.path)
    const censusPath = `${namespace === '' ? '' : `${namespace}/`}_tables`
    const census = tables.get(censusPath)
    if (census === undefined) refuse('snapshot_table_census_missing', `${censusPath}/documents.jsonl`)
    const name = filename(table.path)
    if (name !== '_tables' && name !== '_storage' && !census.rows.some(row => row.name === name)) {
      refuse('snapshot_table_unmapped', `${table.path}/documents.jsonl`)
    }
  }
  for (const table of tables.values()) {
    if (filename(table.path) !== '_tables') continue
    const namespace = parent(table.path)
    for (const row of table.rows) {
      const dataPath = `${namespace === '' ? '' : `${namespace}/`}${row.name as string}`
      if (!tables.has(dataPath)) refuse('snapshot_table_data_missing', `${dataPath}/documents.jsonl`)
    }
  }
  for (const [path, schemaDigest] of schemas) {
    const table = tables.get(path)
    if (table === undefined) refuse('snapshot_schema_without_data', `${path}/generated_schema.jsonl`)
    table.schemaDigest = schemaDigest
  }
  const storageFiles = validateStorage(tables, members)
  const summaries: ConvexSnapshotTable[] = [...tables.values()].map(table => ({
    path: table.path, count: table.rows.length,
    identityDigest: sha256(`[${table.rows.map(row => {
      const keys = filename(table.path) === '_tables' ? ['name', 'id'] : ['_id', '_creationTime']
      return `[${keys.map(key => canonical(row[key]!, 0, numberSources.get(row)?.get(key))).join(',')}]`
    }).join(',')}]`),
    contentDigest: digest(table.rows), schemaDigest: table.schemaDigest,
  }))
  if (await archiveDigest(absolutePath, budget) !== archiveSHA256) refuse('snapshot_archive_changed')
  const logicalMembers = members.filter(member => member.kind !== 'directory').map(member => ({
    path: member.path, kind: member.kind, contentDigest: member.contentDigest,
  }))
  return {
    version: 1, scope: 'records_and_files', archiveSHA256,
    counts: { tables: summaries.length, documents: budget.documents, files: storageFiles.length, members: logicalMembers.length },
    tables: summaries, storageFiles, members,
    digests: { tables: digest(summaries.map(table => ({ ...table }))),
      storage: digest(storageFiles.map(file => ({ ...file }))), members: digest(logicalMembers) },
  }
}

export async function compareConvexSnapshots(sourcePath: string, restoredPath: string,
  optionalLimits: Partial<ConvexSnapshotLimits> = {}): Promise<ConvexSnapshotComparison> {
  const limits = limitsFrom(optionalLimits)
  const deadline = Date.now() + limits.timeoutMs
  const source = await readConvexSnapshot(sourcePath, limits)
  const timeoutMs = deadline - Date.now()
  if (timeoutMs <= 0) refuse('snapshot_timeout')
  const restored = await readConvexSnapshot(restoredPath, { ...limits, timeoutMs })
  const expected = new Map(source.tables.map(table => [table.path, table]))
  const actual = new Map(restored.tables.map(table => [table.path, table]))
  for (const path of [...new Set([...expected.keys(), ...actual.keys()])].sort()) {
    const left = expected.get(path)
    const right = actual.get(path)
    if (left === undefined || right === undefined) refuse('snapshot_table_mismatch', path)
    if (left.count !== right.count || left.identityDigest !== right.identityDigest) refuse('snapshot_identity_mismatch', path)
    if (left.contentDigest !== right.contentDigest) refuse('snapshot_content_mismatch', path)
    if (left.schemaDigest !== right.schemaDigest) refuse('snapshot_schema_mismatch', path)
  }
  if (source.digests.storage !== restored.digests.storage) refuse('snapshot_storage_mismatch', '_storage')
  if (source.digests.members !== restored.digests.members) {
    const actualMembers = new Map(restored.members.filter(member => member.kind !== 'directory').map(member => [member.path, member.contentDigest]))
    for (const member of source.members) {
      if (member.kind !== 'directory' && actualMembers.get(member.path) !== member.contentDigest) refuse('snapshot_member_mismatch', member.path)
      actualMembers.delete(member.path)
    }
    refuse('snapshot_member_mismatch', actualMembers.keys().next().value as string | undefined)
  }
  return {
    version: 1, scope: 'records_and_files', kind: 'matched', sourceArchiveSHA256: source.archiveSHA256,
    restoredArchiveSHA256: restored.archiveSHA256, counts: source.counts, digests: source.digests,
  }
}
