import {
  stableAeSearchContextKey,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { AnswerToolCallRecord, AnswerTurnRecord } from '../answer-thread.schema'

export function normalizeAnswerTurnQuery(query: string): string {
  return query.trim().slice(0, 200)
}

export function answerTurnRequestDigest(input: {
  threadId?: string
  query: string
  searchContext?: AeSearchContext
}): string {
  return canonicalDigest({
    threadId: input.threadId ?? null,
    query: normalizeAnswerTurnQuery(input.query),
    searchContext: stableAeSearchContextKey(input.searchContext),
  }).toString()
}

export function answerTurnReservationKey(input: {
  sessionId: string
  threadScope: string
  clientTurnKey: string
}): string {
  return canonicalDigest({
    sessionId: input.sessionId,
    threadScope: input.threadScope,
    clientTurnKey: input.clientTurnKey,
  }).toString()
}

export function answerTurnFinalizationDigest(input: {
  turn: Pick<
    AnswerTurnRecord,
    | 'turnId'
    | 'threadId'
    | 'seq'
    | 'query'
    | 'intent'
    | 'evidenceJson'
    | 'snapshotHash'
    | 'proseJson'
    | 'artifactKindsJson'
    | 'status'
    | 'createdAt'
  > & { errorCopyId?: string; errorProblemJson?: string }
  toolCalls: readonly Pick<
    AnswerToolCallRecord,
    | 'toolCallId'
    | 'seq'
    | 'toolId'
    | 'inputJson'
    | 'resultSummaryJson'
    | 'resultJson'
    | 'resultHash'
    | 'status'
    | 'createdAt'
  >[]
}): string {
  return canonicalDigest({
    turn: {
      turnId: input.turn.turnId,
      threadId: input.turn.threadId,
      seq: input.turn.seq,
      query: input.turn.query,
      intent: input.turn.intent,
      evidenceJson: input.turn.evidenceJson,
      snapshotHash: input.turn.snapshotHash,
      proseJson: input.turn.proseJson,
      artifactKindsJson: input.turn.artifactKindsJson,
      status: input.turn.status,
      createdAt: input.turn.createdAt,
      errorCopyId: input.turn.errorCopyId ?? null,
      errorProblemJson: input.turn.errorProblemJson ?? null,
    },
    toolCalls: input.toolCalls.map((call) => ({
      toolCallId: call.toolCallId,
      seq: call.seq,
      toolId: call.toolId,
      inputJson: call.inputJson,
      resultSummaryJson: call.resultSummaryJson,
      resultJson: call.resultJson,
      resultHash: call.resultHash,
      status: call.status,
      createdAt: call.createdAt,
    })),
  }).toString()
}
