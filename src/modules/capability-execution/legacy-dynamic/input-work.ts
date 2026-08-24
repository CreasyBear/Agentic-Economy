import type { PublishedOperation } from '@/modules/capability-supply/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { isRecord } from '@/modules/common/is-record'

import type { ActionInvocationOrigin, InvocationActor } from '@/modules/action-invocation/runtime'
import { dynamicPublishedSourceDigest } from './dynamic-published-contract'
import { materializeRuntimePublishedOperation } from '@/modules/capability-supply/public'

const RESERVED_INPUT_NAMES = /^(method|path|query|payment|credential|target|provider|price|config|transport|endpoint)$/iu

export type InvocationInputWork = Readonly<{
  invocationRef: string
  invocationVersion: number
  origin: ActionInvocationOrigin
  owner: InvocationActor
  state: 'gathering_information' | 'prepared'
  operationId: string
  operationVersion: string
  sourceMaterialDigest: string
  knownInput: Readonly<Record<string, StableHashValue>>
  requiredFields: readonly string[]
  missingFields: readonly string[]
  askedFields: readonly string[]
  updatedAt: string
}>

export type InvocationInputHistory = Readonly<{
  invocationRef: string
  invocationVersion: number
  kind: 'begin' | 'answer' | 'prepare' | 'correct'
  commandDigest: string
  recordedAt: string
}>

export function inspectUserInputContract(operation: PublishedOperation): Readonly<{
  requiredFields: readonly string[]
  descriptorVersion: string
  sourceMaterialDigest: string
}> {
  const schema = operation.contract.inputSchema
  if (!isRecord(schema) || !Array.isArray(schema.required)) {
    throw new Error('published_operation_required_input_schema_invalid')
  }
  const requiredFields = schema.required.filter(
    (field): field is string => typeof field === 'string' && field.length > 0,
  )
  if (requiredFields.some((field) => RESERVED_INPUT_NAMES.test(field))) {
    throw new Error('published_operation_reserved_required_field_refused')
  }
  const descriptor = materializeRuntimePublishedOperation(operation)
  return {
    requiredFields,
    descriptorVersion: descriptor.version,
    sourceMaterialDigest: dynamicPublishedSourceDigest(operation, descriptor),
  }
}

export function missingUserInput(
  requiredFields: readonly string[],
  knownInput: Readonly<Record<string, StableHashValue>>,
): readonly string[] {
  return requiredFields.filter((field) => {
    const value = knownInput[field]
    return value === undefined || value === null || value === ''
  })
}

export function mergeUserInput(input: Readonly<{
  current: InvocationInputWork
  answers: Readonly<Record<string, StableHashValue>>
}>): Readonly<Record<string, StableHashValue>> {
  const allowed = new Set(input.current.missingFields)
  if (Object.keys(input.answers).some(
    (field) => RESERVED_INPUT_NAMES.test(field) || !allowed.has(field),
  )) throw new Error('invocation_input_field_refused')
  return { ...input.current.knownInput, ...input.answers }
}


