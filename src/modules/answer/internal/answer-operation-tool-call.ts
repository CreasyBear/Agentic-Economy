import {
  type JsonValue,
} from '@/modules/capability-contract/public'
import {
  type KeylessExecutableSourcePort,
  type OperationExecuteDeps,
  type OperationExecuteResult,
} from '@/modules/capability-execution'
import { executeKeylessOperation } from '@/modules/capability-execution/operation-execute.server'
import {
  type OperationInvokeResult,
} from '@/modules/capability-execution/operation-invoke-contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { safeJsonStringify } from '@/modules/common/safe-json-stringify'
import {
  ANSWER_OPERATION_EFFECT_TOOL_IDS,
  refuseAnswerToolCall,
  type AnswerToolCallRecord,
  type AnswerToolCallResultSummary,
  type AnswerToolCallStatus,
  type RunAnswerToolCallInput,
  type RunAnswerToolCallResult,
} from '@/modules/answer-thread/tooling'
import type { AnswerOperationInvokeContext } from '@/modules/answer-thread/answer-thread.schema'
import {
  decideAnswerOperationResultPrivacy,
} from './operation-result-presentation'
import {
  MAX_MODEL_TOOL_RESULT_BYTES,
  safeToolResultJsonForPrompt,
} from './answer-tool-result-json'
import { AnswerToolUseAgentError } from './answer-tool-use-agent-types'

const [OPERATION_EXECUTE_TOOL_ID, OPERATION_INVOKE_TOOL_ID] =
  ANSWER_OPERATION_EFFECT_TOOL_IDS
const ANSWER_OPERATION_EFFECT_KEY_PREFIX = 'answer-operation-effect:v1'

export type OperationToolCallResult = RunAnswerToolCallResult &
  Readonly<{
    records?: readonly AnswerToolCallRecord[]
  }>

function buildAnswerOperationEffectKey(
  operationInvokeContext: AnswerOperationInvokeContext,
  turnId: string,
  effectOrdinal: number,
): string {
  const { reservationKey } = operationInvokeContext
  if (
    typeof reservationKey !== 'string' ||
    reservationKey.trim().length === 0 ||
    typeof turnId !== 'string' ||
    turnId.trim().length === 0 ||
    !Number.isSafeInteger(effectOrdinal) ||
    effectOrdinal < 0
  ) {
    throw new AnswerToolUseAgentError('unavailable')
  }
  return `${ANSWER_OPERATION_EFFECT_KEY_PREFIX}:${canonicalDigest({
    reservationKey,
    turnId,
    ordinal: effectOrdinal,
  }).toString()}`
}

/**
 * Executes one descriptor-bound operation through the existing fail-closed
 * executor or controlled invocation service. Multi-operation composition
 * remains a registered inspect-plan concern; one model tool call cannot hide
 * a second provider effect.
 */
export async function runOperationToolCall(
  input: RunAnswerToolCallInput,
  toolCallId: string,
  source: KeylessExecutableSourcePort,
  operationExecuteDeps:
    Partial<Pick<OperationExecuteDeps, 'isPublicTarget' | 'fetchImpl' | 'signal'>> | undefined,
  expectedExecutionBindingDigest: string | undefined,
  effectOrdinal: number,
  operationInvokeContext?: AnswerOperationInvokeContext,
  signal?: AbortSignal,
): Promise<OperationToolCallResult> {
  const raw = input.input
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return refuseAnswerToolCall(input, 'input_invalid', toolCallId)
  }
  const envelope = raw as { operationRef?: unknown; input?: unknown }
  const operationRef = envelope.operationRef
  const opInput = envelope.input
  if (
    typeof operationRef !== 'string' ||
    (opInput !== undefined &&
      (opInput === null ||
        typeof opInput !== 'object' ||
        Array.isArray(opInput)))
  ) {
    return refuseAnswerToolCall(input, 'input_invalid', toolCallId)
  }

  const targetInput = (opInput === undefined ? {} : opInput) as Record<
    string,
    unknown
  >
  if (operationInvokeContext !== undefined) {
    const idempotencyKey = buildAnswerOperationEffectKey(
      operationInvokeContext,
      input.turnId,
      effectOrdinal,
    )
    signal?.throwIfAborted()
    const result = await operationInvokeContext.service.invokeOperation({
      input: {
        operationRef,
        input: targetInput as Record<string, JsonValue>,
        idempotencyKey,
      },
      principal: operationInvokeContext.principal,
      correlationId: operationInvokeContext.correlationId,
    })
    return buildOperationInvokeToolCallResult(
      input,
      toolCallId,
      {
        operationRef,
        input: targetInput,
        idempotencyKey,
      },
      result,
    )
  }
  const operationInput = { operationRef, input: targetInput }
  const executeDeps =
    operationExecuteDeps === undefined
      ? signal === undefined
        ? undefined
        : { signal }
      : signal === undefined
        ? operationExecuteDeps
        : { ...operationExecuteDeps, signal }
  const result =
    expectedExecutionBindingDigest === undefined
      ? executeDeps === undefined
        ? await executeKeylessOperation(operationInput, source)
        : await executeKeylessOperation(operationInput, source, executeDeps)
      : executeDeps === undefined
        ? await executeKeylessOperation(
            operationInput,
            source,
            undefined,
            expectedExecutionBindingDigest,
          )
        : await executeKeylessOperation(
            operationInput,
            source,
            executeDeps,
            expectedExecutionBindingDigest,
          )
  return buildOperationToolCallResult(
    input,
    toolCallId,
    operationInput,
    result,
    input.seq,
  )
}

function executeResultStatus(
  privacyKind: 'safe' | 'unsafe',
  result: OperationExecuteResult,
): AnswerToolCallStatus {
  if (privacyKind === 'unsafe') return 'refused'
  switch (result.kind) {
    case 'ok':
      return 'complete'
    case 'refused':
      return 'refused'
    case 'error':
      return 'error'
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}

function executeResultErrorCode(
  privacyKind: 'safe' | 'unsafe',
  result: OperationExecuteResult,
): string | undefined {
  if (privacyKind === 'unsafe') return 'unsafe_output'
  switch (result.kind) {
    case 'ok':
      return undefined
    case 'error':
      return result.code
    case 'refused':
      return result.kind
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}

function buildOperationToolCallResult(
  input: RunAnswerToolCallInput,
  toolCallId: string,
  operationInput: { operationRef: string; input: Record<string, unknown> },
  result: OperationExecuteResult,
  seq = input.seq,
  resultForPrompt: unknown = result,
): OperationToolCallResult {
  const privacy = decideAnswerOperationResultPrivacy(
    operationInput.operationRef,
    resultForPrompt,
  )
  const fullResultJson = safeToolResultJsonForPrompt(
    safeJsonStringify(privacy.result),
  )
  let resultJson = fullResultJson
  let status: AnswerToolCallStatus = executeResultStatus(privacy.kind, result)
  let errorCode: string | undefined = executeResultErrorCode(privacy.kind, result)
  if (
    privacy.kind === 'safe'
    && new TextEncoder().encode(fullResultJson).byteLength >
      MAX_MODEL_TOOL_RESULT_BYTES
  ) {
    resultJson = safeJsonStringify({
      kind: 'refused',
      operationRef: operationInput.operationRef,
      reason: 'result_too_large',
      resultHash: privacy.resultDigest,
    })
    status = 'refused'
    errorCode = 'result_too_large'
  }
  const inputJson = safeJsonStringify(operationInput)
  const summary: AnswerToolCallResultSummary = {
    slugs: [],
    count: 0,
    ...(errorCode === undefined ? {} : { errorCode }),
  }
  const resultSummaryJson = safeJsonStringify(summary)
  const record: AnswerToolCallRecord = {
    toolCallId,
    turnId: input.turnId,
    seq,
    toolId: OPERATION_EXECUTE_TOOL_ID as AnswerToolCallRecord['toolId'],
    inputJson,
    resultSummaryJson,
    resultJson,
    resultHash: canonicalDigest({
      toolId: OPERATION_EXECUTE_TOOL_ID,
      input: inputJson,
      summary: resultSummaryJson,
      resultJson,
      status,
    }).toString(),
    status,
    createdAt: Date.now(),
  }
  return {
    record,
    providers: [],
    allowedSlugs: new Set<string>(),
    timings: [],
    resultJson,
  }
}

function invokeResultStatus(
  privacyKind: 'safe' | 'unsafe',
  result: OperationInvokeResult,
): AnswerToolCallStatus {
  if (privacyKind === 'unsafe') return 'refused'
  switch (result.kind) {
    case 'refused':
      return 'refused'
    case 'completed':
    case 'pending':
    case 'needs_authority':
    case 'reconciliation_required':
      return 'complete'
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}

function invokeResultErrorCode(
  privacyKind: 'safe' | 'unsafe',
  result: OperationInvokeResult,
): string | undefined {
  if (privacyKind === 'unsafe') return 'unsafe_output'
  switch (result.kind) {
    case 'refused':
      return result.code
    case 'completed':
    case 'pending':
    case 'needs_authority':
    case 'reconciliation_required':
      return undefined
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}

function buildOperationInvokeToolCallResult(
  input: RunAnswerToolCallInput,
  toolCallId: string,
  operationInput: {
    operationRef: string
    input: Record<string, unknown>
    idempotencyKey: string
  },
  result: OperationInvokeResult,
): OperationToolCallResult {
  const privacy = decideAnswerOperationResultPrivacy(
    operationInput.operationRef,
    result,
  )
  const exactResultJson = safeJsonStringify(privacy.result)
  const promptResult = safeToolResultJsonForPrompt(exactResultJson)
  const promptResultJson =
    privacy.kind === 'safe'
    && new TextEncoder().encode(promptResult).byteLength >
      MAX_MODEL_TOOL_RESULT_BYTES
      ? safeJsonStringify({
          kind: 'result_bounded',
          operationRef: operationInput.operationRef,
          resultHash: privacy.resultDigest,
        })
      : promptResult
  const status = invokeResultStatus(privacy.kind, result)
  const errorCode = invokeResultErrorCode(privacy.kind, result)
  const inputJson = safeJsonStringify(operationInput)
  const summary: AnswerToolCallResultSummary = {
    slugs: [],
    count: 0,
    ...(errorCode === undefined ? {} : { errorCode }),
  }
  const resultSummaryJson = safeJsonStringify(summary)
  const record: AnswerToolCallRecord = {
    toolCallId,
    turnId: input.turnId,
    seq: input.seq,
    toolId: OPERATION_INVOKE_TOOL_ID as AnswerToolCallRecord['toolId'],
    inputJson,
    resultSummaryJson,
    resultJson: exactResultJson,
    resultHash: canonicalDigest({
      toolId: OPERATION_INVOKE_TOOL_ID,
      input: inputJson,
      summary: resultSummaryJson,
      resultJson: exactResultJson,
      status,
    }).toString(),
    status,
    createdAt: Date.now(),
  }
  return {
    record,
    providers: [],
    allowedSlugs: new Set<string>(),
    timings: [],
    resultJson: promptResultJson,
  }
}
