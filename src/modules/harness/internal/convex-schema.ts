import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'

import {
  HarnessRunStatusValues,
  HarnessSessionEntryKindValues,
} from '../harness.schema'

export const harnessTables = {
  harnessSessions: defineTable({
    sessionId: v.string(),
    ownerKey: v.string(),
    entryCount: v.number(),
    activeLeafEntryId: v.optional(v.string()),
    lastRunId: v.optional(v.string()),
    status: v.optional(literalUnion(HarnessRunStatusValues)),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_sessionId', ['sessionId'])
    .index('by_ownerKey_updatedAt', ['ownerKey', 'updatedAt'])
    .index('by_lastRunId', ['lastRunId']),

  harnessSessionEntries: defineTable({
    entryId: v.string(),
    sessionId: v.string(),
    ownerKey: v.string(),
    runId: v.string(),
    turnId: v.optional(v.string()),
    seq: v.number(),
    parentEntryId: v.optional(v.string()),
    kind: literalUnion(HarnessSessionEntryKindValues),
    status: v.optional(literalUnion(HarnessRunStatusValues)),
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
    .index('by_entryId', ['entryId'])
    .index('by_sessionId_seq', ['sessionId', 'seq'])
    .index('by_sessionId_entryId', ['sessionId', 'entryId'])
    .index('by_sessionId_idempotencyKey', ['sessionId', 'idempotencyKey'])
    .index('by_sessionId_parentEntryId', ['sessionId', 'parentEntryId'])
    .index('by_idempotencyKey', ['idempotencyKey'])
    .index('by_ownerKey_createdAt', ['ownerKey', 'createdAt'])
    .index('by_runId_seq', ['runId', 'seq'])
    .index('by_turnId_seq', ['turnId', 'seq']),
} as const
