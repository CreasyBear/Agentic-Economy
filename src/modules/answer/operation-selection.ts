import { isCanonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import {
  isPublicOperationRef,
  type PublicOperationRef,
} from '@/modules/registry/public'

export const ANSWER_OPERATION_INPUT_MAX_BYTES = 256 * 1024

export type AnswerOperationSelectionInput = Readonly<{
  operationRef: PublicOperationRef
  input: Record<string, JsonValue>
  candidateSetDigest: string
}>

function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return isRecord(value)
}

/**
 * Parses a composer JSON payload `{ operationRef, input, candidateSetDigest }`.
 * That payload is a tool argument, not a host planner phase.
 */
export function parseAnswerOperationSelectionInput(
  query: string,
): AnswerOperationSelectionInput | undefined {
  if (new TextEncoder().encode(query).byteLength > ANSWER_OPERATION_INPUT_MAX_BYTES) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(query)
  } catch {
    return undefined
  }
  if (
    !isRecord(parsed)
    || Object.keys(parsed).some(
      (key) => key !== 'operationRef' && key !== 'input' && key !== 'candidateSetDigest',
    )
    || !isPublicOperationRef(parsed.operationRef)
    || typeof parsed.candidateSetDigest !== 'string'
    || !isCanonicalDigest(parsed.candidateSetDigest)
    || !isRecord(parsed.input)
  ) {
    return undefined
  }
  const input = jsonValueSchema.safeParse(parsed.input)
  return input.success && isJsonObject(input.data)
    ? {
        operationRef: parsed.operationRef,
        input: input.data,
        candidateSetDigest: parsed.candidateSetDigest,
      }
    : undefined
}
