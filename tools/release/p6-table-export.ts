import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import {
  buildUnmeasuredCloseoutExportManifest,
  digestTableRows,
  P6_CLOSEOUT_EXPORT_TABLES,
  type TableExportEntry,
  type TableExportManifest,
  P6_TABLE_EXPORT_SCHEMA_VERSION,
} from '../../src/modules/product-frontier/table-export-digest'

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function readJsonlRows(path: string): readonly Record<string, unknown>[] {
  const text = readFileSync(path, 'utf8')
  const rows: Record<string, unknown>[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`p6_table_export_row_not_object:${path}`)
    }
    rows.push(parsed as Record<string, unknown>)
  }
  return rows
}

function digestFromInputDir(inputDir: string, capturedAt: string): TableExportManifest {
  const tables: TableExportEntry[] = P6_CLOSEOUT_EXPORT_TABLES.map((table) => {
    const filePath = join(inputDir, `${table}.jsonl`)
    try {
      return digestTableRows(table, readJsonlRows(filePath))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return digestTableRows(table, [])
      }
      throw error
    }
  })
  return {
    schemaVersion: P6_TABLE_EXPORT_SCHEMA_VERSION,
    capturedAt,
    evidenceClass: 'source-local',
    deployment: 'observed',
    tables,
  }
}

const inputDir = argValue('--input')
const outPath = resolve(argValue('--out') ?? '.planning/evidence/p6-table-export-manifest.json')
const capturedAt = new Date().toISOString().slice(0, 10)
const manifest = inputDir === undefined
  ? buildUnmeasuredCloseoutExportManifest(capturedAt)
  : digestFromInputDir(resolve(inputDir), capturedAt)

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${outPath}\n`)
