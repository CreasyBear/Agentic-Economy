import type { RuntimePublishedOperationDescriptor } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { requiredFields } from './host-projection'

export type InvocationClarification = Readonly<{
  known: Readonly<Record<string, StableHashValue>>
  missing: readonly string[]
  questions: readonly Readonly<{ field: string; prompt: string }>[]
  continuation: 'answer_missing_information' | 'prepare_current_operation'
  digest: string
}>

export function clarifyInvocationInput(input: Readonly<{
  descriptor: RuntimePublishedOperationDescriptor
  known: Readonly<Record<string, StableHashValue>>
}>): InvocationClarification {
  const missing = requiredFields(input.descriptor.inputSchema).filter((field) => {
    const value = input.known[field]
    return value === undefined || value === null || value === ''
  })
  const annotations = input.descriptor.inputSchema as Record<string, any>
  const properties = annotations.properties as Record<string, any> | undefined
  const questions = missing.map((field) => ({
    field,
    prompt: `What ${String(properties?.[field]?.title ?? field)} should be used?`,
  }))
  const material = {
    known: { ...input.known },
    missing,
    questions,
    continuation: missing.length === 0
      ? 'prepare_current_operation' as const
      : 'answer_missing_information' as const,
  }
  return { ...material, digest: canonicalDigest(material as unknown as StableHashValue) }
}

export function applyClarificationAnswer(input: Readonly<{
  descriptor: RuntimePublishedOperationDescriptor
  current: InvocationClarification
  answers: Readonly<Record<string, StableHashValue>>
}>): InvocationClarification {
  const allowed = new Set(input.current.missing)
  if (Object.keys(input.answers).some((field) => !allowed.has(field))) {
    throw new Error('clarification_unrequested_field_refused')
  }
  return clarifyInvocationInput({
    descriptor: input.descriptor,
    known: { ...input.current.known, ...input.answers },
  })
}
