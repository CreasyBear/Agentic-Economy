import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { flush, initDataset } from 'braintrust'

import { api } from '../../../convex/_generated/api'
import { createAuthenticatedConvexClient } from '@/lib/server/convex-source'
import type { CliOptions } from '../lib/args'
import { CliFailure, heading, line, printJson, table } from '../lib/output'
import {
  MAX_BRAINTRUST_TURNS,
  buildBraintrustLearningPacket,
  parseLearningSelection,
  toBraintrustDatasetRecord,
  type LearningSelection,
  type LearningTurnRow,
  type BraintrustLearningPacket,
} from '../lib/braintrust-learning'

const DEFAULT_BRAINTRUST_PROJECT = 'Agentic Economy'
const DEFAULT_BRAINTRUST_DATASET = 'ae-answer-reviewed'

type AdminTurnsResult =
  | {
      kind: 'allowed'
      turns: readonly LearningTurnRow[]
      limit: number
      truncated: boolean
    }
  | {
      kind: 'denied'
      reason: string
      turns: readonly LearningTurnRow[]
      limit: number
      truncated: false
    }

/** `ae eval export` previews by default; `--allow-write` is the export gate. */
export async function runEvalCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const [subcommand] = args
  if (subcommand === 'export') {
    await runExport(args.slice(1), options)
    return
  }
  if (subcommand === 'snapshot') {
    await runSnapshot(options)
    return
  }
  throw new CliFailure('Usage: npm run -s ae -- advanced eval export --turn-id <turnId> [--turn-id <turnId> ...] | npm run -s ae -- advanced eval snapshot --snapshot-name <name>', {
    kind: 'INVALID_ARGUMENT',
    code: 'eval-usage',
  })
}

async function runExport(args: readonly string[], options: CliOptions): Promise<void> {
  const selection = readSelection(args, options)
  const rows = await readAdminTurns(selection)
  const packets: BraintrustLearningPacket[] = []
  for (const row of rows) {
    const packet = buildBraintrustLearningPacket(row, selection.expectedByTurnId[row.turnId])
    if (packet.kind === 'refused') {
      throw new CliFailure(`Turn ${row.turnId} cannot be exported: ${packet.reason}`, {
        kind: 'FAILED_PRECONDITION',
        code: `learning-${packet.reason}`,
      })
    }
    packets.push(packet.packet)
  }

  const project = options.project ?? (process.env.AE_BRAINTRUST_PROJECT?.trim() || DEFAULT_BRAINTRUST_PROJECT)
  const datasetName = options.dataset ?? (process.env.AE_BRAINTRUST_DATASET?.trim() || DEFAULT_BRAINTRUST_DATASET)
  const records = packets.map((packet) => toBraintrustDatasetRecord(packet, selection.expectedByTurnId[packet.turnId]))
  if (options.allowWrite && records.some((record) => record.expected === undefined)) {
    throw new CliFailure('Every exported dataset record requires a reviewer-authored expected target in expectedByTurnId.', {
      kind: 'FAILED_PRECONDITION',
      code: 'reviewed-expected-required',
    })
  }
  const preview = {
    kind: 'braintrust_dataset_preview',
    project,
    dataset: datasetName,
    explicitTurnCount: selection.turnIds.length,
    reviewedExpectedCount: records.filter((record) => record.expected !== undefined).length,
    maxTurnCount: MAX_BRAINTRUST_TURNS,
    exportRequested: options.allowWrite,
    records,
  }

  if (!options.allowWrite) {
    if (options.json) {
      printJson(preview)
      return
    }
    heading('Braintrust dataset preview')
    table([
      ['Project', project],
      ['Dataset', datasetName],
      ['Turns', `${records.length}/${MAX_BRAINTRUST_TURNS}`],
      ['Export', 'not requested — re-run with --allow-write'],
    ])
    line('')
    printJson(records)
    return
  }

  const apiKey = process.env.BRAINTRUST_API_KEY?.trim()
  if (apiKey === undefined || apiKey.length === 0) {
    throw new CliFailure('BRAINTRUST_API_KEY is required for an explicit dataset export.', {
      kind: 'UNAUTHENTICATED',
      code: 'braintrust-key-required',
    })
  }

  const dataset = initDataset({ project, dataset: datasetName, apiKey })
  for (const record of records) {
    dataset.insert(record)
  }
  await flush()
  const version = await dataset.version()
  const result = {
    kind: 'braintrust_dataset_exported',
    project,
    dataset: datasetName,
    recordIds: records.map((record) => record.id),
    ...(version === undefined ? {} : { version }),
  }
  if (options.json) {
    printJson(result)
    return
  }
  heading('Braintrust dataset exported')
  table([
    ['Project', project],
    ['Dataset', datasetName],
    ['Records', String(records.length)],
    ['Version', version ?? 'unavailable'],
  ])
}

async function runSnapshot(options: CliOptions): Promise<void> {
  if (!options.allowWrite) {
    throw new CliFailure('Snapshot creation is an explicit write. Re-run with --allow-write.', {
      kind: 'PERMISSION_DENIED',
      code: 'braintrust-snapshot-write-required',
    })
  }
  const apiKey = process.env.BRAINTRUST_API_KEY?.trim()
  if (apiKey === undefined || apiKey.length === 0) {
    throw new CliFailure('BRAINTRUST_API_KEY is required for an explicit dataset snapshot.', {
      kind: 'UNAUTHENTICATED',
      code: 'braintrust-key-required',
    })
  }
  const snapshotName = options.snapshotName?.trim()
  if (snapshotName === undefined || snapshotName.length === 0) {
    throw new CliFailure('--snapshot-name is required for `ae eval snapshot`.', {
      kind: 'INVALID_ARGUMENT',
      code: 'braintrust-snapshot-name-required',
    })
  }
  const project = options.project ?? (process.env.AE_BRAINTRUST_PROJECT?.trim() || DEFAULT_BRAINTRUST_PROJECT)
  const datasetName = options.dataset ?? (process.env.AE_BRAINTRUST_DATASET?.trim() || DEFAULT_BRAINTRUST_DATASET)
  const dataset = initDataset({ project, dataset: datasetName, apiKey })
  await flush()
  const snapshot = await dataset.createSnapshot({
    name: snapshotName,
    ...(options.updateSnapshot === undefined ? {} : { update: options.updateSnapshot }),
  })
  const result = {
    kind: 'braintrust_dataset_snapshot_created',
    project,
    dataset: datasetName,
    snapshotName,
    xactId: snapshot.xact_id,
  }
  if (options.json) {
    printJson(result)
    return
  }
  heading('Braintrust dataset snapshot created')
  table([
    ['Project', project],
    ['Dataset', datasetName],
    ['Snapshot', snapshotName],
    ['Immutable xact id', snapshot.xact_id],
  ])
}

function readSelection(args: readonly string[], options: CliOptions): LearningSelection {
  const ids = [...(options.turnIds ?? [])]
  const manifestPath = options.manifest ?? args.find((arg) => arg.startsWith('@'))?.slice(1)
  let manifest: unknown = { turnIds: ids }
  if (manifestPath !== undefined) {
    try {
      manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) as unknown
    } catch {
      throw new CliFailure(`Could not read learning manifest: ${manifestPath}`, {
        kind: 'INVALID_ARGUMENT',
        code: 'learning-manifest-read-failed',
      })
    }
    if (ids.length > 0 && typeof manifest === 'object' && manifest !== null && !Array.isArray(manifest)) {
      const record = manifest as Record<string, unknown>
      const manifestIds = record.turnIds
      if (Array.isArray(manifestIds)) {
        manifest = { ...record, turnIds: [...ids, ...manifestIds] }
      }
    }
  }
  const parsed = parseLearningSelection(manifest)
  if (parsed.kind === 'refused') {
    throw new CliFailure(`Invalid explicit learning selection: ${parsed.reason}`, {
      kind: 'INVALID_ARGUMENT',
      code: `learning-${parsed.reason}`,
    })
  }
  return parsed.selection
}

async function readAdminTurns(selection: LearningSelection): Promise<LearningTurnRow[]> {
  const client = await createAdminClient()
  const rows: LearningTurnRow[] = []
  for (const turnId of selection.turnIds) {
    const result = await client.query(api.answerThreads.listAdminHarnessRunTurns, { turnId, limit: 1 }) as AdminTurnsResult
    if (result.kind === 'denied') {
      throw new CliFailure(`Admin read denied for ${turnId}: ${result.reason}`, {
        kind: 'PERMISSION_DENIED',
        code: 'admin-read-denied',
      })
    }
    const row = result.turns.find((candidate) => candidate.turnId === turnId)
    if (row === undefined) {
      throw new CliFailure(`Finalized answer turn not found: ${turnId}`, {
        kind: 'NOT_FOUND',
        code: 'answer-turn-not-found',
      })
    }
    rows.push(row)
  }
  return rows
}

async function createAdminClient() {
  const token = process.env.CONVEX_AUTH_TOKEN?.trim()
  if (token !== undefined && token.length > 0) {
    return createAuthenticatedConvexClient({
      authObject: {
        isAuthenticated: true,
        getToken: async () => token,
      },
    })
  }
  if (process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true' && process.env.CONVEX_SELF_HOSTED_ADMIN_KEY?.trim()) {
    return createAuthenticatedConvexClient()
  }
  throw new CliFailure('Admin Convex auth is required. Set CONVEX_AUTH_TOKEN (or local E2E auth plus CONVEX_SELF_HOSTED_ADMIN_KEY).', {
    kind: 'UNAUTHENTICATED',
    code: 'admin-auth-required',
  })
}
