import type {
  AnswerOperationOutcome,
  AnswerOperationPresentation,
  AnswerOperationPrivacyFailure,
} from '../answer-schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { resolveJsonPointer } from '@/modules/common/json-pointer'
import { safeJsonStringify } from '@/modules/common/safe-json-stringify'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/answer-thread.schema'
import { neutralizeBidiFormattingControls } from '../projection'

export type AnswerOperationResultAnnotation = Readonly<{
  pointer: string
  label: string
  role: AnswerOperationPresentation['outputAnnotations'][number]['role']
  semanticIdentity?: string
  value: unknown
  href?: string
}>

export type AnswerOperationResultView = Readonly<{
  stateLabel: string
  output?: unknown
  annotations: readonly AnswerOperationResultAnnotation[]
  presentation?: AnswerOperationPresentation
}>

const FORBIDDEN_OUTPUT_KEY = /(?:api[_-]?key|authorization|bearer|credential|password|private[_-]?key|secret|token)/i

export type AnswerOperationResultPrivacyDecision =
  | Readonly<{
      kind: 'safe'
      result: unknown
      resultDigest: string
    }>
  | Readonly<{
      kind: 'unsafe'
      result: AnswerOperationPrivacyFailure
      resultDigest: string
      originalResultDigest: string
    }>

/**
 * One server-side privacy decision for an operation result. The raw result
 * digest and provider evidence/invocation references stay opaque; the result
 * body itself is replaced before any model, stream, or durable projection sees
 * it.
 */
export function decideAnswerOperationResultPrivacy(
  operationRef: string,
  result: unknown,
): AnswerOperationResultPrivacyDecision {
  const originalResultDigest = canonicalDigest(result).toString()
  if (!hasForbiddenAnswerOutputKey(result)) {
    return {
      kind: 'safe',
      result,
      resultDigest: originalResultDigest,
    }
  }
  const opaque = isRecord(result)
    ? {
        ...(typeof result.evidenceHash === 'string'
          ? { evidenceHash: result.evidenceHash }
          : {}),
        ...(typeof result.invocationRef === 'string'
          ? { invocationRef: result.invocationRef }
          : {}),
      }
    : {}
  const failure: AnswerOperationPrivacyFailure = {
    kind: 'unsafe_output',
    operationRef,
    resultHash: originalResultDigest,
    ...opaque,
  }
  return {
    kind: 'unsafe',
    result: failure,
    resultDigest: canonicalDigest(failure).toString(),
    originalResultDigest,
  }
}

export function sanitizeAnswerOperationOutcome(
  outcome: AnswerOperationOutcome,
): AnswerOperationOutcome {
  const decision = decideAnswerOperationResultPrivacy(
    outcome.operationRef,
    outcome.result,
  )
  if (decision.kind === 'safe') return outcome
  return {
    ...outcome,
    result: decision.result,
    resultDigest: decision.resultDigest,
  }
}

export function sanitizeAnswerOperationToolCallRecord(
  record: AnswerToolCallRecord,
): AnswerToolCallRecord {
  if (record.toolId !== 'operation.execute' && record.toolId !== 'operation.invoke') {
    return record
  }
  let result: unknown
  try {
    result = JSON.parse(record.resultJson)
  } catch {
    return record
  }
  const operationRef = operationRefFromRecord(record, result)
  if (operationRef === undefined) return record
  const decision = decideAnswerOperationResultPrivacy(operationRef, result)
  if (decision.kind === 'safe') return record
  const resultJson = safeJsonStringify(decision.result)
  const status = 'refused' as const
  return {
    ...record,
    resultJson,
    resultHash: canonicalDigest({
      toolId: record.toolId,
      input: record.inputJson,
      summary: record.resultSummaryJson,
      resultJson,
      status,
    }).toString(),
    status,
  }
}

export function hasForbiddenAnswerOutputKey(
  value: unknown,
  seen = new Set<object>(),
): boolean {
  if (Array.isArray(value)) {
    if (seen.has(value)) return true
    seen.add(value)
    return value.some((item) => hasForbiddenAnswerOutputKey(item, seen))
  }
  if (!isRecord(value)) return false
  if (seen.has(value)) return true
  seen.add(value)
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_OUTPUT_KEY.test(key)
    || hasForbiddenAnswerOutputKey(nested, seen))
}

function operationRefFromRecord(
  record: AnswerToolCallRecord,
  result: unknown,
): string | undefined {
  if (isRecord(result) && typeof result.operationRef === 'string') {
    return result.operationRef
  }
  try {
    const input: unknown = JSON.parse(record.inputJson)
    return isRecord(input) && typeof input.operationRef === 'string'
      ? input.operationRef
      : undefined
  } catch {
    return undefined
  }
}

export function projectAnswerOperationResult(
  outcome: AnswerOperationOutcome,
): AnswerOperationResultView {
  const privacy = decideAnswerOperationResultPrivacy(
    outcome.operationRef,
    outcome.result,
  )
  const result = privacy.kind === 'safe' ? outcome.result : privacy.result
  const output = result.kind === 'ok' || result.kind === 'completed'
    ? result.output
    : undefined
  const annotations = output === undefined || outcome.presentation === undefined
    ? []
    : outcome.presentation.outputAnnotations.flatMap((annotation) => {
        const resolved = resolveJsonPointer(output, annotation.pointer)
        if (!resolved.found) return []
        const href = annotation.semanticIdentity === 'https-link'
          ? validatedHttpsHref(resolved.value)
          : undefined
        return [{
          pointer: annotation.pointer,
          label: annotation.label,
          role: annotation.role,
          ...(annotation.semanticIdentity === undefined
            ? {}
            : { semanticIdentity: annotation.semanticIdentity }),
          value: resolved.value,
          ...(href === undefined ? {} : { href }),
        }]
      })

  return {
    stateLabel: result.kind === 'ok' || result.kind === 'completed'
      ? 'Operation completed'
      : result.kind === 'unsafe_output'
        ? 'Result withheld'
        : result.kind === 'refused'
          ? 'Operation not run'
          : result.kind === 'pending'
            ? 'Operation pending'
            : result.kind === 'needs_authority'
              ? 'Approval required'
              : result.kind === 'reconciliation_required'
                ? 'Reconciliation required'
                : 'Operation failed',
    ...(output === undefined ? {} : { output }),
    annotations,
    ...(outcome.presentation === undefined
      ? {}
      : { presentation: outcome.presentation }),
  }
}

function validatedHttpsHref(value: unknown): string | undefined {
  if (typeof value !== 'string'
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/u.test(value)
    || neutralizeBidiFormattingControls(value) !== value) {
    return undefined
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname.length > 0
      && url.username.length === 0
      && url.password.length === 0
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}
