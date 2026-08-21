import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'

import type {
  HarnessRunStatus,
  HarnessSessionEntryKind,
} from '../src/modules/harness/harness.schema'
import {
  harnessKindValue,
  harnessRunStatus,
  harnessSessionEntryKind,
  harnessStatusValue,
  toEntryReceipt,
} from './harnessSessionsAppend'

const harnessSessionSummaryResult = v.object({
  sessionId: v.string(),
  ownerKey: v.string(),
  entryCount: v.number(),
  activeLeafEntryId: v.optional(v.string()),
  lastRunId: v.optional(v.string()),
  status: v.optional(harnessRunStatus),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const harnessSessionPublicSummaryResult = v.object({
  sessionId: v.string(),
  entryCount: v.number(),
  status: v.optional(harnessRunStatus),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const harnessSessionPrivateEntryResult = v.object({
  entryId: v.string(),
  sessionId: v.string(),
  ownerKey: v.string(),
  runId: v.string(),
  turnId: v.optional(v.string()),
  seq: v.number(),
  parentEntryId: v.optional(v.string()),
  kind: harnessSessionEntryKind,
  status: v.optional(harnessRunStatus),
  idempotencyKey: v.string(),
  requestHash: v.string(),
  createdAt: v.number(),
  payloadJson: v.string(),
  publicSummaryJson: v.optional(v.string()),
  privatePayloadJson: v.optional(v.string()),
  schemaVersion: v.number(),
  toolContractHash: v.optional(v.string()),
  sourceSnapshotHash: v.optional(v.string()),
})

const harnessSessionPublicEntryResult = v.object({
  seq: v.number(),
  kind: harnessSessionEntryKind,
  status: v.optional(harnessRunStatus),
  createdAt: v.number(),
  publicSummaryJson: v.optional(v.string()),
})

export const listHarnessSessionEntriesResult = v.object({
  kind: v.literal('ok'),
  session: v.union(harnessSessionPublicSummaryResult, v.null()),
  entries: v.array(harnessSessionPublicEntryResult),
  limit: v.number(),
  truncated: v.boolean(),
})

export const listHarnessRunEntriesResult = v.object({
  kind: v.literal('ok'),
  entries: v.array(harnessSessionPublicEntryResult),
  limit: v.number(),
  truncated: v.boolean(),
})

export const readAdminHarnessSessionEntriesResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    session: v.union(harnessSessionSummaryResult, v.null()),
    entries: v.array(harnessSessionPrivateEntryResult),
    limit: v.number(),
    truncated: v.boolean(),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(v.literal('missing_membership'), v.literal('inactive_membership'), v.literal('action_not_allowed')),
    session: v.null(),
    entries: v.array(harnessSessionPrivateEntryResult),
    limit: v.number(),
    truncated: v.literal(false),
  }),
)

export type ListHarnessSessionEntriesHandlerArgs = {
  sessionId: string
  limit?: number | undefined
}

export type ListHarnessRunEntriesHandlerArgs = {
  runId: string
  limit?: number | undefined
}

export type ReadAdminHarnessSessionEntriesHandlerArgs = {
  sessionId: string
  limit?: number | undefined
}

export async function listHarnessSessionEntriesHandler(
  ctx: QueryCtx,
  args: ListHarnessSessionEntriesHandlerArgs,
) {
  const limit = normalizeLimit(args.limit)
  const [session, rows] = await Promise.all([
    ctx.db
      .query('harnessSessions')
      .withIndex('by_sessionId', (query) => query.eq('sessionId', args.sessionId))
      .unique(),
    ctx.db
      .query('harnessSessionEntries')
      .withIndex('by_sessionId_seq', (query) => query.eq('sessionId', args.sessionId))
      .order('desc')
      .take(limit),
  ])

  return {
    kind: 'ok' as const,
    session: session === null ? null : toPublicSessionSummary(session),
    entries: rows.map(toPublicEntry).sort(comparePublicEntries),
    limit,
    truncated: session !== null && session.entryCount > rows.length,
  }
}

export async function listHarnessRunEntriesHandler(
  ctx: QueryCtx,
  args: ListHarnessRunEntriesHandlerArgs,
) {
  const limit = normalizeLimit(args.limit)
  const rows = await ctx.db
    .query('harnessSessionEntries')
    .withIndex('by_runId_seq', (query) => query.eq('runId', args.runId))
    .order('desc')
    .take(limit)

  return {
    kind: 'ok' as const,
    entries: rows.map(toPublicEntry).sort(comparePublicEntries),
    limit,
    truncated: rows.length === limit,
  }
}

export async function readAdminHarnessSessionEntriesHandler(
  ctx: QueryCtx,
  args: ReadAdminHarnessSessionEntriesHandlerArgs,
) {
  const limit = normalizeLimit(args.limit)
  const authority = await resolveAdminAuthority({ db: ctx.db, auth: ctx.auth }, 'read_admin_readbacks')
  if (authority.kind === 'denied') {
    return {
      kind: 'denied' as const,
      reason: authority.reason,
      session: null,
      entries: [],
      limit,
      truncated: false as const,
    }
  }

  const [session, rows] = await Promise.all([
    ctx.db
      .query('harnessSessions')
      .withIndex('by_sessionId', (query) => query.eq('sessionId', args.sessionId))
      .unique(),
    ctx.db
      .query('harnessSessionEntries')
      .withIndex('by_sessionId_seq', (query) => query.eq('sessionId', args.sessionId))
      .order('desc')
      .take(limit),
  ])

  return {
    kind: 'allowed' as const,
    session: session === null ? null : toSessionSummary(session),
    entries: rows.map(toPrivateEntry).sort(comparePrivateEntries),
    limit,
    truncated: session !== null && session.entryCount > rows.length,
  }
}

function toSessionSummary(row: Doc<'harnessSessions'>): {
  sessionId: string
  ownerKey: string
  entryCount: number
  activeLeafEntryId?: string
  lastRunId?: string
  status?: HarnessRunStatus
  createdAt: number
  updatedAt: number
} {
  const status = harnessStatusValue(row.status)
  return {
    sessionId: row.sessionId,
    ownerKey: row.ownerKey,
    entryCount: row.entryCount,
    ...(row.activeLeafEntryId === undefined ? {} : { activeLeafEntryId: row.activeLeafEntryId }),
    ...(row.lastRunId === undefined ? {} : { lastRunId: row.lastRunId }),
    ...(status === undefined ? {} : { status }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toPublicSessionSummary(row: Doc<'harnessSessions'>): {
  sessionId: string
  entryCount: number
  status?: HarnessRunStatus
  createdAt: number
  updatedAt: number
} {
  const status = harnessStatusValue(row.status)
  return {
    sessionId: row.sessionId,
    entryCount: row.entryCount,
    ...(status === undefined ? {} : { status }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toPrivateEntry(row: Doc<'harnessSessionEntries'>): {
  entryId: string
  sessionId: string
  ownerKey: string
  runId: string
  turnId?: string
  seq: number
  parentEntryId?: string
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey: string
  requestHash: string
  createdAt: number
  payloadJson: string
  publicSummaryJson?: string
  privatePayloadJson?: string
  schemaVersion: number
  toolContractHash?: string
  sourceSnapshotHash?: string
} {
  const receipt = toEntryReceipt(row)
  return {
    ...receipt,
    ownerKey: row.ownerKey,
    requestHash: row.requestHash,
    payloadJson: row.payloadJson,
    ...(row.publicSummaryJson === undefined ? {} : { publicSummaryJson: row.publicSummaryJson }),
    ...(row.privatePayloadJson === undefined ? {} : { privatePayloadJson: row.privatePayloadJson }),
    schemaVersion: row.schemaVersion,
    ...(row.toolContractHash === undefined ? {} : { toolContractHash: row.toolContractHash }),
    ...(row.sourceSnapshotHash === undefined ? {} : { sourceSnapshotHash: row.sourceSnapshotHash }),
  }
}

function toPublicEntry(row: Doc<'harnessSessionEntries'>): {
  seq: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  createdAt: number
  publicSummaryJson?: string
} {
  const status = harnessStatusValue(row.status)
  return {
    seq: row.seq,
    kind: harnessKindValue(row.kind),
    ...(status === undefined ? {} : { status }),
    createdAt: row.createdAt,
    ...(row.publicSummaryJson === undefined ? {} : { publicSummaryJson: row.publicSummaryJson }),
  }
}

function comparePublicEntries(a: ReturnType<typeof toPublicEntry>, b: ReturnType<typeof toPublicEntry>): number {
  return a.seq - b.seq || a.createdAt - b.createdAt
}

function comparePrivateEntries(a: ReturnType<typeof toPrivateEntry>, b: ReturnType<typeof toPrivateEntry>): number {
  return a.seq - b.seq || a.createdAt - b.createdAt || a.entryId.localeCompare(b.entryId)
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 100
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 500)
}
