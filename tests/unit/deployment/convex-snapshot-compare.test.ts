import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { convexToJson } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  compareConvexSnapshots, ConvexSnapshotDiagnostic, readConvexSnapshot,
} from '../../../tools/release/convex-snapshot-compare'

const directories: string[] = []
const file = Buffer.from([0, 255, 17, 201, 0, 10])
const fileHash = createHash('sha256').update(file).digest('base64')
const jsonl = (values: readonly unknown[]): string => `${values.map(value => JSON.stringify(value)).join('\n')}\n`
const rows = Array.from({ length: 1_007 }, (_, index) => ({
  _id: `record_${index.toString().padStart(4, '0')}`, _creationTime: 1_700_000_000_000.125 + index,
  int64: '9223372036854775807', bytes: 'AP8RyQAK', fractional: 0.125,
  unknownField: { nested: [false, null, index] }, privateText: 'PRIVATE_ROW_MUST_NOT_APPEAR_IN_RECEIPT',
}))

function contents(): Map<string, string | Buffer> {
  return new Map<string, string | Buffer>([
    ['records/documents.jsonl', jsonl(rows)],
    ['records/generated_schema.jsonl', jsonl(['native type information', { int64: 'int64', bytes: 'bytes' }])],
    ['empty/documents.jsonl', ''],
    ['_tables/documents.jsonl', jsonl([{ name: 'records', id: 10_001 }, { name: '_storage', id: 10_002 }, { name: 'empty', id: 10_003 }])],
    ['_tables/generated_schema.jsonl', jsonl(['table mapping'])],
    ['_components/agent/messages/documents.jsonl', jsonl([
      { _id: 'component_message', _creationTime: 1.125, role: 'assistant', text: 'retained component answer' },
    ])],
    ['_components/agent/messages/generated_schema.jsonl', jsonl(['component schema'])],
    ['_components/agent/_tables/documents.jsonl', jsonl([{ name: 'messages', id: 20_001 }])],
    ['_components/agent/_tables/generated_schema.jsonl', jsonl(['uniform'])],
    ['_storage/documents.jsonl', jsonl([
      { _id: 'file_1', _creationTime: 1.5, size: file.length, sha256: fileHash, contentType: 'application/octet-stream', internalId: 'native_file_locator' },
    ])],
    ['_storage/generated_schema.jsonl', jsonl(['storage schema'])],
    ['_storage/file_1.bin', file],
    ['README.md', 'Native snapshot metadata; every member is retained.\n'],
  ])
}

async function command(program: string, args: readonly string[], cwd?: string): Promise<string> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(program, [...args], { ...(cwd === undefined ? {} : { cwd }), stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    let errorOutput = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (value: string) => { output += value })
    child.stderr.on('data', (value: string) => { errorOutput += value })
    child.once('error', reject)
    child.once('close', status => status === 0 ? resolvePromise(output) : reject(new Error(`fixture_command_failed:${status}:${errorOutput}`)))
    child.stdin.end()
  })
}

async function archive(entries = contents(), compression = '-0'): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ae-convex-snapshot-compare-'))
  directories.push(directory)
  const root = join(directory, 'contents')
  await mkdir(root)
  for (const [path, value] of entries) {
    const destination = join(root, path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, value)
  }
  const path = join(directory, 'snapshot.zip')
  await command('/usr/bin/zip', ['-q', compression, path, ...entries.keys()], root)
  return path
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('complete native Convex snapshot comparison', () => {
  it('reads all 1,007 records, native table mappings, component records, schemas and binary bytes without returning rows', async () => {
    const snapshot = await readConvexSnapshot(await archive())
    expect(snapshot.scope).toBe('records_and_files')
    expect(snapshot.counts).toEqual({ tables: 6, documents: 1_013, files: 1, members: 13 })
    expect(snapshot.tables.find(table => table.path === 'records')?.count).toBe(1_007)
    expect(snapshot.tables.find(table => table.path === 'empty')?.count).toBe(0)
    expect(snapshot.tables.find(table => table.path === '_tables')?.count).toBe(3)
    expect(snapshot.storageFiles).toEqual([
      { path: '_storage/file_1.bin', bytes: file.length, SHA256: createHash('sha256').update(file).digest('hex') },
    ])
    expect(snapshot.members.map(member => member.path)).toEqual([...contents().keys()].sort())
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_ROW_MUST_NOT_APPEAR_IN_RECEIPT')
    expect(JSON.stringify(snapshot)).not.toContain('retained component answer')
  })

  it('matches different ZIP compression/entry order, record order and object-key order with schema positions preserved', async () => {
    const source = await archive()
    const reversed = new Map([...contents().entries()].reverse())
    reversed.set('records/documents.jsonl', jsonl([...rows].reverse().map(row => Object.fromEntries(Object.entries(row).reverse()))))
    reversed.set('_tables/documents.jsonl', jsonl([{ id: 10_003, name: 'empty' }, { id: 10_002, name: '_storage' }, { id: 10_001, name: 'records' }]))
    reversed.set('records/generated_schema.jsonl', jsonl(['native type information', { bytes: 'bytes', int64: 'int64' }]))
    const receipt = await compareConvexSnapshots(source, await archive(reversed, '-9'))
    expect(receipt.kind).toBe('matched')
    expect(receipt.sourceArchiveSHA256).not.toBe(receipt.restoredArchiveSHA256)
    expect(receipt.counts.documents).toBe(1_013)
    expect(JSON.stringify(receipt)).not.toContain('PRIVATE_ROW_MUST_NOT_APPEAR_IN_RECEIPT')
  })

  it.each([
    ['old record content', 'snapshot_content_mismatch', rows.map((row, index) => index === 0 ? { ...row, fractional: 0.25 } : row)],
    ['same-count ID substitution', 'snapshot_identity_mismatch', rows.map((row, index) => index === 0 ? { ...row, _id: 'other_record' } : row)],
    ['creation time', 'snapshot_identity_mismatch', rows.map((row, index) => index === 0 ? { ...row, _creationTime: 1_700_000_000_000.5 } : row)],
    ['missing row', 'snapshot_identity_mismatch', rows.slice(1)],
    ['extra row', 'snapshot_identity_mismatch', [...rows, { ...rows[0]!, _id: 'additional_record' }]],
    ['exact int64 value', 'snapshot_content_mismatch', rows.map((row, index) => index === 0 ? { ...row, int64: '9223372036854775806' } : row)],
  ])('detects %s beyond a sample without exposing values', async (_name, code, changedRows) => {
    const entries = contents()
    entries.set('records/documents.jsonl', jsonl(changedRows))
    await expect(compareConvexSnapshots(await archive(), await archive(entries))).rejects.toMatchObject({ code, path: 'records' })
  })

  it('detects changed real component data and full schema contents', async () => {
    const component = contents()
    component.set('_components/agent/messages/documents.jsonl', jsonl([
      { _id: 'component_message', _creationTime: 1.125, role: 'assistant', text: 'different retained answer' },
    ]))
    await expect(compareConvexSnapshots(await archive(), await archive(component)))
      .rejects.toMatchObject({ code: 'snapshot_content_mismatch', path: '_components/agent/messages' })
    const schema = contents()
    schema.set('records/generated_schema.jsonl', jsonl(['native type information', { int64: 'string', bytes: 'bytes' }]))
    await expect(compareConvexSnapshots(await archive(), await archive(schema)))
      .rejects.toMatchObject({ code: 'snapshot_schema_mismatch', path: 'records' })
  })

  it('hashes unknown metadata and refuses extra/missing native members', async () => {
    const extra = contents()
    extra.set('unknown-native-metadata.json', '{"version":2}')
    await expect(compareConvexSnapshots(await archive(), await archive(extra)))
      .rejects.toMatchObject({ code: 'snapshot_member_mismatch', path: 'unknown-native-metadata.json' })
    const missing = contents()
    missing.delete('README.md')
    await expect(compareConvexSnapshots(await archive(), await archive(missing)))
      .rejects.toMatchObject({ code: 'snapshot_member_mismatch', path: 'README.md' })
  })

  it('refuses missing or changed file bytes rather than accepting metadata alone', async () => {
    const missing = contents()
    missing.delete('_storage/file_1.bin')
    await expect(readConvexSnapshot(await archive(missing)))
      .rejects.toMatchObject({ code: 'snapshot_storage_file_missing', path: '_storage/file_1' })
    const changed = contents()
    changed.set('_storage/file_1.bin', Buffer.from([1, 255, 17, 201, 0, 10]))
    await expect(readConvexSnapshot(await archive(changed)))
      .rejects.toMatchObject({ code: 'snapshot_storage_checksum_mismatch', path: '_storage/file_1.bin' })
  })

  it('detects an internally valid changed file, including its matching metadata', async () => {
    const changed = contents()
    const bytes = Buffer.from([1, 255, 17, 201, 0, 10])
    changed.set('_storage/file_1.bin', bytes)
    changed.set('_storage/documents.jsonl', jsonl([
      { _id: 'file_1', _creationTime: 1.5, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('base64'),
        contentType: 'application/octet-stream', internalId: 'native_file_locator' },
    ]))
    await expect(compareConvexSnapshots(await archive(), await archive(changed)))
      .rejects.toMatchObject({ code: 'snapshot_content_mismatch', path: '_storage' })
  })

  it('refuses unbound, duplicate-ID and size-mismatched storage files', async () => {
    const extra = contents()
    extra.set('_storage/unknown_file.bin', Buffer.from([1]))
    await expect(readConvexSnapshot(await archive(extra))).rejects.toMatchObject({ code: 'snapshot_storage_metadata_missing' })
    const duplicate = contents()
    duplicate.set('_storage/file_1.csv', file)
    await expect(readConvexSnapshot(await archive(duplicate))).rejects.toMatchObject({ code: 'snapshot_storage_metadata_missing' })
    const size = contents()
    size.set('_storage/file_1.bin', file.subarray(1))
    await expect(readConvexSnapshot(await archive(size))).rejects.toMatchObject({ code: 'snapshot_storage_size_mismatch' })
  })

  it('rejects duplicated record identities, malformed JSON/UTF-8, missing metadata and orphan schema', async () => {
    const duplicate = contents()
    duplicate.set('records/documents.jsonl', jsonl([rows[0], rows[0]]))
    await expect(readConvexSnapshot(await archive(duplicate))).rejects.toMatchObject({ code: 'snapshot_duplicate_record', path: 'records/documents.jsonl' })
    const malformed = contents()
    malformed.set('records/documents.jsonl', '{"PRIVATE_PAYLOAD":\n')
    await expect(readConvexSnapshot(await archive(malformed))).rejects.toEqual(expect.objectContaining({ code: 'snapshot_json_invalid' }))
    const utf8 = contents()
    utf8.set('records/documents.jsonl', Buffer.from([0xff]))
    await expect(readConvexSnapshot(await archive(utf8))).rejects.toMatchObject({ code: 'snapshot_utf8_invalid' })
    const metadata = contents()
    metadata.delete('_storage/documents.jsonl')
    metadata.delete('_storage/generated_schema.jsonl')
    metadata.set('_tables/documents.jsonl', jsonl([{ name: 'records', id: 10_001 }, { name: 'empty', id: 10_003 }]))
    await expect(readConvexSnapshot(await archive(metadata))).rejects.toMatchObject({ code: 'snapshot_storage_metadata_missing' })
    const orphan = contents()
    orphan.set('orphan/generated_schema.jsonl', '"orphan schema"\n')
    await expect(readConvexSnapshot(await archive(orphan))).rejects.toMatchObject({ code: 'snapshot_schema_without_data' })
  })

  it('rejects unsafe native member paths without extracting or printing the path', async () => {
    const entries = contents()
    // This file stays inside the owned temporary directory but ZIP retains its unsafe member path.
    entries.set('../PRIVATE_PATH', 'not document data')
    const path = await archive(entries)
    await expect(readConvexSnapshot(path)).rejects.toMatchObject({ code: 'snapshot_member_path_invalid', path: undefined })
  })

  it('refuses incomplete native table mappings even if both archives have the same missing data', async () => {
    const entries = contents()
    entries.delete('empty/documents.jsonl')
    const path = await archive(entries)
    await expect(compareConvexSnapshots(path, path))
      .rejects.toMatchObject({ code: 'snapshot_table_data_missing', path: 'empty/documents.jsonl' })
    entries.set('_tables/documents.jsonl', jsonl([{ name: 'records', id: 10_001 }, { name: 'records', id: 10_003 }]))
    await expect(readConvexSnapshot(await archive(entries))).rejects.toMatchObject({ code: 'snapshot_duplicate_record' })
  })

  it('requires a root and component namespace census plus each ordinary table name', async () => {
    const root = contents()
    root.delete('_tables/documents.jsonl')
    root.delete('_tables/generated_schema.jsonl')
    await expect(readConvexSnapshot(await archive(root)))
      .rejects.toMatchObject({ code: 'snapshot_table_census_missing', path: '_tables/documents.jsonl' })
    const component = contents()
    component.delete('_components/agent/_tables/documents.jsonl')
    component.delete('_components/agent/_tables/generated_schema.jsonl')
    await expect(readConvexSnapshot(await archive(component)))
      .rejects.toMatchObject({ code: 'snapshot_table_census_missing', path: '_components/agent/_tables/documents.jsonl' })
    const unmapped = contents()
    unmapped.set('_tables/documents.jsonl', jsonl([{ name: 'empty', id: 10_003 }]))
    await expect(readConvexSnapshot(await archive(unmapped)))
      .rejects.toMatchObject({ code: 'snapshot_table_unmapped', path: 'records/documents.jsonl' })
  })

  it('requires the positional string schema header and detects reordered legacy context lines', async () => {
    for (const schema of ['', jsonl([{}]), jsonl(['']), jsonl([{ bytes: 'bytes' }, 'native type information'])]) {
      const entries = contents()
      entries.set('records/generated_schema.jsonl', schema)
      await expect(readConvexSnapshot(await archive(entries)))
        .rejects.toMatchObject({ code: 'snapshot_schema_invalid', path: 'records/generated_schema.jsonl' })
    }
    const source = contents()
    source.set('records/generated_schema.jsonl', jsonl(['native type information', { record_0000: {} }, { record_0001: {} }]))
    const reversed = contents()
    reversed.set('records/generated_schema.jsonl', jsonl(['native type information', { record_0001: {} }, { record_0000: {} }]))
    await expect(compareConvexSnapshots(await archive(source), await archive(reversed)))
      .rejects.toMatchObject({ code: 'snapshot_schema_mismatch', path: 'records' })
  })

  it.each([
    ['9007199254740992', '9007199254740993'],
    ['1', '1.0'],
    ['-0.0', '0.0'],
    ['-0', '0'],
  ])('distinguishes native numeric values/types %s from %s without JS rounding', async (left, right) => {
    const source = contents()
    source.set('records/documents.jsonl', `{"_id":"numeric_record","_creationTime":1.125,"nested":[{"value":${left}}]}\n`)
    const restored = contents()
    restored.set('records/documents.jsonl', `{"_id":"numeric_record","_creationTime":1.125,"nested":[{"value":${right}}]}\n`)
    await expect(compareConvexSnapshots(await archive(source), await archive(restored)))
      .rejects.toMatchObject({ code: 'snapshot_content_mismatch', path: 'records' })
  })

  it('normalizes equivalent float representations while preserving exact raw integers and identity fields', async () => {
    const source = contents()
    source.set('records/documents.jsonl', '{"_id":"numeric_record","_creationTime":1.125,"integer":9007199254740993,"float":1.0,"array":[1.5]}\n')
    const restored = contents()
    restored.set('records/documents.jsonl', '{"array":[15e-1],"float":1e0,"integer":9007199254740993,"_creationTime":1125e-3,"_id":"numeric_record"}\n')
    await expect(compareConvexSnapshots(await archive(source), await archive(restored))).resolves.toMatchObject({ kind: 'matched' })
    restored.set('records/documents.jsonl', '{"_id":"numeric_record","_creationTime":1,"integer":9007199254740993,"float":1.0,"array":[1.5]}\n')
    source.set('records/documents.jsonl', '{"_id":"numeric_record","_creationTime":1.0,"integer":9007199254740993,"float":1.0,"array":[1.5]}\n')
    await expect(compareConvexSnapshots(await archive(source), await archive(restored)))
      .rejects.toMatchObject({ code: 'snapshot_identity_mismatch', path: 'records' })
  })

  it('preserves supported typed encodings and refuses malformed native value tags', async () => {
    const valid = contents()
    valid.set('records/documents.jsonl', jsonl([
      convexToJson({ _id: 'typed_record', _creationTime: 1.125, integer: 9_223_372_036_854_775_807n,
        bytes: new Uint8Array([0, 255]).buffer, special: Number.NaN, negativeZero: -0 }),
    ]))
    expect((await readConvexSnapshot(await archive(valid))).tables.find(table => table.path === 'records')?.count).toBe(1)
    for (const field of [{ $integer: 'garbage' }, { $bytes: 123 }, { $float: 'not-a-float' }]) {
      const invalid = contents()
      invalid.set('records/documents.jsonl', jsonl([{ _id: 'typed_record', _creationTime: 1.125, field }]))
      await expect(readConvexSnapshot(await archive(invalid))).rejects.toMatchObject({ code: 'snapshot_record_invalid', path: 'records/documents.jsonl' })
    }
  })

  it('refuses each saturation boundary rather than publishing a partial manifest', async () => {
    const path = await archive()
    await expect(readConvexSnapshot(path, { maxDocuments: 100 })).rejects.toMatchObject({ code: 'snapshot_record_limit' })
    await expect(readConvexSnapshot(path, { maxMembers: 2 })).rejects.toMatchObject({ code: 'snapshot_member_limit' })
    await expect(readConvexSnapshot(path, { maxMemberBytes: 16 })).rejects.toMatchObject({ code: 'snapshot_output_limit' })
    await expect(readConvexSnapshot(path, { maxTotalBytes: 16 })).rejects.toMatchObject({ code: 'snapshot_output_limit' })
    await expect(readConvexSnapshot(path, { maxCommandOutputBytes: 16 })).rejects.toMatchObject({ code: 'snapshot_output_limit' })
    await expect(readConvexSnapshot(path, { maxArchiveBytes: 16 })).rejects.toMatchObject({ code: 'snapshot_archive_too_large' })
    await expect(readConvexSnapshot(path, { timeoutMs: 0 })).rejects.toMatchObject({ code: 'snapshot_limits_invalid' })
  })

  it('enforces the complete operation deadline and safe failures for unreadable archives', async () => {
    const path = await archive()
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(120_001)
    await expect(readConvexSnapshot(path)).rejects.toMatchObject({ code: 'snapshot_timeout' })
    vi.restoreAllMocks()
    await expect(readConvexSnapshot(`${path}.missing`)).rejects.toBeInstanceOf(ConvexSnapshotDiagnostic)
    await expect(readConvexSnapshot(`${path}.missing`)).rejects.toMatchObject({ code: 'snapshot_archive_unreadable' })
  })
})
