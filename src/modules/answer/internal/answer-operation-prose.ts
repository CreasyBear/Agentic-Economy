import {
  operationInvokeResultSchema,
  type OperationInvokeResult,
} from '@/modules/capability-execution/operation-invoke-contracts'
import { isRecord } from '@/modules/common/is-record'
import {
  ANSWER_OPERATION_EFFECT_TOOL_IDS,
  type AnswerToolCallRecord,
} from '@/modules/answer-thread/tooling'
import { type AnswerProse } from '../answer-prose'

const [OPERATION_EXECUTE_TOOL_ID, OPERATION_INVOKE_TOOL_ID] =
  ANSWER_OPERATION_EFFECT_TOOL_IDS

function isLocallyBudgetRefusedEffect(
  call: AnswerToolCallRecord,
): boolean {
  if (call.executed !== false) return false
  try {
    const result: unknown = JSON.parse(call.resultJson)
    return (
      isRecord(result)
      && result.kind === 'refused'
      && result.code === 'budget_exceeded'
    )
  } catch {
    return false
  }
}

export function buildDeterministicOperationProse(
  toolCalls: readonly AnswerToolCallRecord[],
): AnswerProse | undefined {
  const latestExecuteIndex = toolCalls.findLastIndex(
    (call) =>
      call?.toolId === OPERATION_EXECUTE_TOOL_ID
      && !isLocallyBudgetRefusedEffect(call),
  )
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const call = toolCalls[index]
    if (
      call === undefined ||
      call.toolId !== OPERATION_INVOKE_TOOL_ID ||
      isLocallyBudgetRefusedEffect(call) ||
      latestExecuteIndex > index
    )
      continue
    let result: OperationInvokeResult
    try {
      const raw: unknown = JSON.parse(call.resultJson)
      if (isRecord(raw) && raw.kind === 'unsafe_output') {
        return buildUnsafeOperationOutputProse()
      }
      result = operationInvokeResultSchema.parse(raw)
    } catch {
      continue
    }
    switch (result.kind) {
      case 'completed':
        return undefined
      case 'pending':
        return {
          oneLine: 'The operation was accepted and is still running.',
          summary: 'No terminal result is available yet.',
          whatToDoNow:
            'Check the invocation status before taking any result-dependent action.',
        }
      case 'needs_authority':
        return {
          oneLine: 'The operation is waiting for the required authority.',
          summary: 'It has not been released to the provider.',
          whatToDoNow:
            'Review the authority request, then approve or decline it.',
        }
      case 'reconciliation_required':
        return {
          oneLine:
            'The operation outcome is unknown and requires reconciliation.',
          summary:
            'AE will not treat the provider attempt as completed or retry it blindly.',
          whatToDoNow:
            'Reconcile the recorded attempt before retrying or relying on an outcome.',
        }
      case 'refused':
        return {
          oneLine: 'The operation was refused.',
          summary:
            result.nextAction ??
            `The operation was refused with code ${result.code}.`,
          whatToDoNow:
            'Review the refusal and the published operation requirements before trying again.',
        }
      default: {
        const _exhaustive: never = result
        return _exhaustive
      }
    }
  }

  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const call = toolCalls[index]
    if (
      call === undefined
      || call.toolId !== OPERATION_EXECUTE_TOOL_ID
      || isLocallyBudgetRefusedEffect(call)
    )
      continue
    let parsed: {
      kind?: unknown
      name?: unknown
      output?: unknown
      code?: unknown
      reason?: unknown
      composition?: Record<string, unknown>
    }
    try {
      parsed = JSON.parse(call.resultJson) as typeof parsed
    } catch {
      continue
    }
    if (parsed.kind === 'unsafe_output') {
      return buildUnsafeOperationOutputProse()
    }
    if (parsed.kind === 'ok') return undefined
    if (
      parsed.kind === 'refused'
      && parsed.code === 'multiple_operation_intents_require_narrowing'
    ) {
      return {
        oneLine: 'I need you to choose one result before I run anything.',
        summary:
          'The selected operation accepts one requested item per invocation, so this turn made no provider call.',
        whatToDoNow: 'Choose one requested item, or select an operation whose published input batches all of them.',
      }
    }
    const place =
      typeof parsed.composition?.place === 'string'
        ? parsed.composition.place.replace(/[<>]/g, '').trim().slice(0, 200)
        : ''
    const reason =
      typeof parsed.reason === 'string'
        ? operationFailureReason(parsed.reason)
        : typeof parsed.code === 'string'
          ? 'The provider request failed before returning usable data.'
          : 'The live source did not return usable data.'
    const locationDetail = place.length > 0 ? ` for the supplied place` : ''
    return {
      oneLine:
        place.length > 0
          ? `I couldn't complete the live lookup for ${place}.`
          : "I couldn't complete the live lookup.",
      summary: `The live source did not return a result${locationDetail}. ${reason}`,
      whatToDoNow:
        place.length > 0
          ? 'Retry the same lookup later; no additional location details are needed.'
          : 'Retry the lookup or choose another current source.',
    }
  }
  return undefined
}

export function buildUnsafeOperationOutputProse(): AnswerProse {
  return {
    oneLine: 'I could not safely display the live result.',
    summary:
      'The provider call was recorded, but its returned payload cannot be shown in this answer.',
    whatToDoNow:
      'Try a narrower request or continue with the recorded operation for authorized recovery.',
  }
}

export function operationFailureReason(reason: string): string {
  switch (reason) {
    case 'operation_not_found':
      return 'The selected source is no longer available.'
    case 'operation_not_executable':
    case 'operation_not_keyless':
      return 'The selected source cannot run through this live lookup.'
    case 'input_invalid':
      return 'The supplied inputs do not match the current source requirements.'
    case 'endpoint_invalid':
      return 'The selected source has no valid public endpoint.'
    case 'result_too_large':
      return 'The returned data exceeded the safe answer limit.'
    default:
      return 'The provider did not return usable data.'
  }
}
