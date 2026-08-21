import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { sourceWriteArgs } from './sourceWriteAdmission'
import { literalUnion } from '../src/modules/common/convex-literals'
import { FollowUpIntentValues } from '../src/modules/answer-thread/answer-thread.schema'
import {
  appendHarnessSessionEntryHandler,
  appendHarnessSessionEntryResult,
  harnessRunStatus,
  harnessSessionEntryKind,
} from './harnessSessionsAppend'
import {
  answerTurnToolCallInput,
  finalizeReservedAnswerTurnHandler,
  finalizeReservedAnswerTurnResult,
} from './harnessSessionsFinalize'
import {
  listHarnessRunEntriesHandler,
  listHarnessRunEntriesResult,
  listHarnessSessionEntriesHandler,
  listHarnessSessionEntriesResult,
  readAdminHarnessSessionEntriesHandler,
  readAdminHarnessSessionEntriesResult,
} from './harnessSessionsReads'

export const appendHarnessSessionEntry = mutationGeneric({
  args: {
    ownerKey: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    entryId: v.string(),
    sessionId: v.string(),
    runId: v.string(),
    turnId: v.optional(v.string()),
    parentEntryId: v.optional(v.string()),
    seq: v.optional(v.number()),
    kind: harnessSessionEntryKind,
    status: v.optional(harnessRunStatus),
    idempotencyKey: v.optional(v.string()),
    requestHash: v.optional(v.string()),
    createdAt: v.number(),
    payloadJson: v.string(),
    publicSummaryJson: v.optional(v.string()),
    privatePayloadJson: v.optional(v.string()),
    schemaVersion: v.optional(v.number()),
    toolContractHash: v.optional(v.string()),
    sourceSnapshotHash: v.optional(v.string()),
  },
  returns: appendHarnessSessionEntryResult,
  handler: appendHarnessSessionEntryHandler,
})

export const finalizeReservedAnswerTurn = mutationGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    expectedGeneration: v.number(),
    createdAt: v.number(),
    answerDigest: v.string(),
    query: v.string(),
    intent: literalUnion(FollowUpIntentValues),
    finalStatus: v.union(v.literal('complete'), v.literal('error')),
    snapshotHash: v.string(),
    evidenceJson: v.string(),
    proseJson: v.string(),
    artifactKindsJson: v.string(),
    errorCopyId: v.optional(v.string()),
    errorProblemJson: v.optional(v.string()),
    finalizationHash: v.string(),
    toolCalls: v.array(answerTurnToolCallInput),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    entries: v.array(
      v.object({
        ownerKey: v.string(),
        entryId: v.string(),
        sessionId: v.string(),
        runId: v.string(),
        turnId: v.optional(v.string()),
        parentEntryId: v.optional(v.string()),
        seq: v.optional(v.number()),
        kind: harnessSessionEntryKind,
        status: v.optional(harnessRunStatus),
        idempotencyKey: v.optional(v.string()),
        requestHash: v.optional(v.string()),
        createdAt: v.number(),
        payloadJson: v.string(),
        publicSummaryJson: v.optional(v.string()),
        privatePayloadJson: v.optional(v.string()),
        schemaVersion: v.optional(v.number()),
        toolContractHash: v.optional(v.string()),
        sourceSnapshotHash: v.optional(v.string()),
      }),
    ),
  },
  returns: finalizeReservedAnswerTurnResult,
  handler: finalizeReservedAnswerTurnHandler,
})

export const listHarnessSessionEntries = queryGeneric({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: listHarnessSessionEntriesResult,
  handler: listHarnessSessionEntriesHandler,
})

export const listHarnessRunEntries = queryGeneric({
  args: {
    runId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: listHarnessRunEntriesResult,
  handler: listHarnessRunEntriesHandler,
})

export const readAdminHarnessSessionEntries = queryGeneric({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: readAdminHarnessSessionEntriesResult,
  handler: readAdminHarnessSessionEntriesHandler,
})
