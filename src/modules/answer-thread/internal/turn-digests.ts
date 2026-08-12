import {
  parseAnswerOperationSelectionInput,
  type AnswerOperationSelectionInput,
} from '@/modules/answer/operation-selection'
import {
  stableAeSearchContextKey,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'

import type { AnswerToolCallRecord, AnswerTurnRecord } from '../answer-thread.schema'

export type AnswerOperationSelectionRecognition =
  | { kind: 'absent' }
  | { kind: 'valid'; selection: AnswerOperationSelectionInput }
  | { kind: 'invalid' }

function looksLikeStructuredOperationSelection(query: string): boolean {
  const trimmed = query.trim()
  return trimmed.startsWith('{')
    && /(?:operationRef|candidateSetDigest|input)/.test(trimmed)
}

export function parseAnswerOperationSelectionRecognition(
  query: string,
): AnswerOperationSelectionRecognition {
  const normalized = query.trim()
  if (!looksLikeStructuredOperationSelection(normalized)) {
    return { kind: 'absent' }
  }
  const selection = parseAnswerOperationSelectionInput(normalized)
  return selection === undefined
    ? { kind: 'invalid' }
    : { kind: 'valid', selection }
}

export function normalizeAnswerTurnQuery(query: string): string {
  const normalized = query.trim()
  const selection = parseAnswerOperationSelectionRecognition(normalized)
  if (selection.kind === 'valid') {
    return stableStringify({
      operationRef: selection.selection.operationRef,
      input: selection.selection.input,
      candidateSetDigest: selection.selection.candidateSetDigest,
    })
  }
  if (selection.kind === 'invalid') {
    const bounded = normalized.slice(0, 200)
    return looksLikeStructuredOperationSelection(bounded)
      ? bounded
      : `${bounded.slice(0, 180)},"operationRef":`
  }
  return normalized.slice(0, 200)
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
  expectedGeneration: number
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
    expectedGeneration: input.expectedGeneration,
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
