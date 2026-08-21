import { mutationGeneric, paginationOptsValidator, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation } from './_generated/server'

import { sourceWriteArgs } from './sourceWriteAdmission'
import {
  answerTurnReservationResult,
  renewAnswerTurnLeaseHandler,
  renewAnswerTurnLeaseResult,
  reserveAnswerTurnHandler,
} from './answerThreadsReserve'
import {
  persistAnswerTurnCheckpointHandler,
  persistAnswerTurnCheckpointResult,
  readAnswerTurnCheckpointHandler,
  readAnswerTurnCheckpointResult,
  stopAnswerTurnHandler,
  stopAnswerTurnResult,
} from './answerThreadsCheckpoint'
import {
  adminHarnessRunTurnsResult,
  getAnswerThreadHandler,
  getAnswerThreadWithTurnsHandler,
  getOwnedThreadProjectionHandler,
  getSharedThreadProjectionHandler,
  getThreadTurnsHandler,
  listAdminHarnessRunTurnsHandler,
  listSessionThreadsHandler,
  readTurnToolCallsHandler,
} from './answerThreadsReads'
import {
  continueDeleteAnswerThreadHandler,
  deleteAnswerThreadHandler,
  issueAnswerThreadShareHandler,
  issueAnswerThreadShareResult,
  revokeAnswerThreadShareHandler,
  revokeAnswerThreadShareResult,
} from './answerThreadsShare'

export const reserveAnswerTurn = mutationGeneric({
  args: {
    sessionId: v.string(),
    requestedThreadScope: v.string(),
    query: v.string(),
    searchContextJson: v.optional(v.string()),
    requestDigest: v.string(),
    reservationKey: v.string(),
    title: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: answerTurnReservationResult,
  handler: reserveAnswerTurnHandler,
})

export const renewAnswerTurnLease = mutationGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: renewAnswerTurnLeaseResult,
  handler: renewAnswerTurnLeaseHandler,
})

export const persistAnswerTurnCheckpoint = mutationGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    checkpointStep: v.number(),
    checkpointJson: v.string(),
    checkpointDigest: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: persistAnswerTurnCheckpointResult,
  handler: persistAnswerTurnCheckpointHandler,
})

export const readAnswerTurnCheckpoint = queryGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: readAnswerTurnCheckpointResult,
  handler: readAnswerTurnCheckpointHandler,
})

export const stopAnswerTurn = mutationGeneric({
  args: {
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: stopAnswerTurnResult,
  handler: stopAnswerTurnHandler,
})

export const readTurnToolCalls = queryGeneric({
  args: {
    turnId: v.string(),
    pseudonymousSessionId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: readTurnToolCallsHandler,
})

export const listSessionThreads = queryGeneric({
  args: {
    pseudonymousSessionId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: listSessionThreadsHandler,
})

export const getThreadTurns = queryGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: getThreadTurnsHandler,
})

export const listAdminHarnessRunTurns = queryGeneric({
  args: {
    status: v.optional(v.string()),
    turnId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    date: v.optional(v.string()),
    hasRunEvidence: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: adminHarnessRunTurnsResult,
  handler: listAdminHarnessRunTurnsHandler,
})

export const getAnswerThread = queryGeneric({
  args: { threadId: v.string(), pseudonymousSessionId: v.string() },
  handler: getAnswerThreadHandler,
})

export const getAnswerThreadWithTurns = queryGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: getAnswerThreadWithTurnsHandler,
})

// Operation artifacts may contain JSON Schema keys such as `$schema` and `$ref`,
// which Convex cannot serialize as object fields. The server adapter decodes this
// bounded projection string before exposing the typed route contract.
export const getOwnedThreadProjection = queryGeneric({
  args: { threadId: v.string(), pseudonymousSessionId: v.string() },
  handler: getOwnedThreadProjectionHandler,
})

export const getSharedThreadProjection = queryGeneric({
  args: { shareToken: v.string() },
  handler: getSharedThreadProjectionHandler,
})

export const issueAnswerThreadShare = mutationGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: issueAnswerThreadShareResult,
  handler: issueAnswerThreadShareHandler,
})

export const revokeAnswerThreadShare = mutationGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: revokeAnswerThreadShareResult,
  handler: revokeAnswerThreadShareHandler,
})

export const continueDeleteAnswerThread = internalMutation({
  args: { threadId: v.string() },
  handler: continueDeleteAnswerThreadHandler,
})

export const deleteAnswerThread = mutationGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: deleteAnswerThreadHandler,
})
