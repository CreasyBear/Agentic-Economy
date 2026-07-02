import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'

import type {
  HarnessRunStatus,
  HarnessSessionEntryKind,
} from './harness.schema'

export type AppendHarnessSessionEntryArgs = {
  ownerKey: string
  entryId: string
  sessionId: string
  runId: string
  turnId?: string
  parentEntryId?: string
  seq?: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey?: string
  requestHash?: string
  createdAt: number
  payloadJson: string
  publicSummaryJson?: string
  privatePayloadJson?: string
  schemaVersion?: number
  toolContractHash?: string
  sourceSnapshotHash?: string
}

export type HarnessSessionEntryReceipt = {
  entryId: string
  sessionId: string
  runId: string
  turnId?: string
  seq: number
  parentEntryId?: string
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey: string
  createdAt: number
}

export type AppendHarnessSessionEntryResult =
  | {
      status: 'accepted'
      entry: HarnessSessionEntryReceipt
      activeLeafEntryId: string
    }
  | {
      status: 'replayed'
      entry: HarnessSessionEntryReceipt
      activeLeafEntryId?: string
    }
  | {
      status: 'conflict'
      reason: 'entry_id_conflict' | 'idempotency_conflict' | 'parent_conflict'
      message: string
      activeLeafEntryId?: string
      existingEntry?: HarnessSessionEntryReceipt
      attemptedEntry?: HarnessSessionEntryReceipt
    }

export type HarnessSessionSummary = {
  sessionId: string
  ownerKey: string
  entryCount: number
  activeLeafEntryId?: string
  lastRunId?: string
  status?: HarnessRunStatus
  createdAt: number
  updatedAt: number
}

export type HarnessSessionPublicSummary = {
  sessionId: string
  entryCount: number
  status?: HarnessRunStatus
  createdAt: number
  updatedAt: number
}

export type HarnessSessionPublicEntry = {
  seq: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  createdAt: number
  publicSummaryJson?: string
}

export type HarnessSessionPrivateEntry = HarnessSessionEntryReceipt & {
  ownerKey: string
  requestHash: string
  payloadJson: string
  publicSummaryJson?: string
  privatePayloadJson?: string
  schemaVersion: number
  toolContractHash?: string
  sourceSnapshotHash?: string
}

export type ListHarnessSessionEntriesResult = {
  kind: 'ok'
  session: HarnessSessionPublicSummary | null
  entries: readonly HarnessSessionPublicEntry[]
  limit: number
  truncated: boolean
}

export type ListHarnessRunEntriesResult = {
  kind: 'ok'
  entries: readonly HarnessSessionPublicEntry[]
  limit: number
  truncated: boolean
}

export type ReadAdminHarnessSessionEntriesResult =
  | {
      kind: 'allowed'
      session: HarnessSessionSummary | null
      entries: readonly HarnessSessionPrivateEntry[]
      limit: number
      truncated: boolean
    }
  | {
      kind: 'denied'
      reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
      session: null
      entries: readonly HarnessSessionPrivateEntry[]
      limit: number
      truncated: false
    }

export const harnessSessionSourceFunctionRefs = {
  appendEntry: sourceMutation<AppendHarnessSessionEntryArgs, AppendHarnessSessionEntryResult>(
    'harnessSessions:appendHarnessSessionEntry',
  ),
  listSessionEntries: sourceQuery<
    { sessionId: string; limit?: number },
    ListHarnessSessionEntriesResult
  >('harnessSessions:listHarnessSessionEntries'),
  listRunEntries: sourceQuery<
    { runId: string; limit?: number },
    ListHarnessRunEntriesResult
  >('harnessSessions:listHarnessRunEntries'),
  readAdminSessionEntries: sourceQuery<
    { sessionId: string; limit?: number },
    ReadAdminHarnessSessionEntriesResult
  >('harnessSessions:readAdminHarnessSessionEntries'),
} as const

export async function appendHarnessSessionEntryToSource(
  args: AppendHarnessSessionEntryArgs,
): Promise<AppendHarnessSessionEntryResult> {
  return callPublicSourceMutation(harnessSessionSourceFunctionRefs.appendEntry, args)
}

export async function listHarnessSessionEntriesFromSource(
  args: { sessionId: string; limit?: number },
): Promise<ListHarnessSessionEntriesResult> {
  return callPublicSourceQuery(harnessSessionSourceFunctionRefs.listSessionEntries, args)
}

export async function listHarnessRunEntriesFromSource(
  args: { runId: string; limit?: number },
): Promise<ListHarnessRunEntriesResult> {
  return callPublicSourceQuery(harnessSessionSourceFunctionRefs.listRunEntries, args)
}

export async function readAdminHarnessSessionEntriesFromSource(
  args: { sessionId: string; limit?: number },
): Promise<ReadAdminHarnessSessionEntriesResult> {
  return callSourceQuery(harnessSessionSourceFunctionRefs.readAdminSessionEntries, args)
}
