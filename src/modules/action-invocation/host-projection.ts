import type { RuntimePublishedOperationDescriptor } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { ActionInvocationView } from './contracts'
import type { DynamicPublishedInvocationResult } from './dynamic-published-contract'

export type InvocationTaskSemantics = Readonly<{
  identity: Readonly<{ invocationRef: string; invocationVersion: number }>
  operation: Readonly<{ id: string; version: string; name: string; summary: string }>
  requiredInformation: readonly string[]
  missingInformation: readonly string[]
  consequence: string
  price: StableHashValue
  dataRelease: StableHashValue
  suitability: Readonly<{ current: boolean; observedAt: string | null }>
  authorityBoundary: Readonly<{ required: string; accepted: boolean; dataUse: StableHashValue }>
  attempt: Readonly<{
    idempotency: StableHashValue | null
    release: StableHashValue | null
    retry: string
  }>
  evidence: Readonly<{ expected: readonly string[]; observed: StableHashValue | null }>
  disposition: Readonly<{ state: string; refusalOrUnknown: string | null }>
  continuations: readonly string[]
}>

export type RichInvocationTaskProjection = Readonly<{
  kind: 'human_rich_task'
  title: string
  sections: readonly Readonly<{ label: string; value: StableHashValue }>[]
  semantics: InvocationTaskSemantics
  semanticDigest: string
}>

export type StructuredInvocationTaskProjection = Readonly<{
  kind: 'external_agent_task'
  semantics: InvocationTaskSemantics
  semanticDigest: string
}>

export function projectInvocationTask(input: Readonly<{
  view: ActionInvocationView<DynamicPublishedInvocationResult>
  descriptor: RuntimePublishedOperationDescriptor
  suppliedInput: StableHashValue
}>): Readonly<{
  rich: RichInvocationTaskProjection
  structured: StructuredInvocationTaskProjection
}> {
  const requiredInformation = requiredFields(input.descriptor.inputSchema)
  const supplied = isRecord(input.suppliedInput) ? input.suppliedInput : {}
  const missingInformation = requiredInformation.filter((field) => !hasValue(supplied[field]))
  const attempt = input.view.attempts.at(-1)
  const result = input.view.observedResolution.state === 'returned'
    ? input.view.observedResolution.result
    : undefined
  const retry = attempt?.outcome.state === 'timed_out' || attempt?.outcome.state === 'uncertain'
    ? 'reconcile_before_retry'
    : attempt?.outcome.state === 'failed'
      ? attempt.outcome.retry
      : input.descriptor.retryClass
  const semantics: InvocationTaskSemantics = {
    identity: {
      invocationRef: input.view.invocationRef,
      invocationVersion: input.view.invocationVersion,
    },
    operation: {
      id: input.descriptor.id,
      version: input.descriptor.version,
      name: input.descriptor.name,
      summary: input.descriptor.summary,
    },
    requiredInformation,
    missingInformation,
    consequence: input.view.prepared?.consequence ?? input.descriptor.consequenceClass,
    price: input.descriptor.price as unknown as StableHashValue,
    dataRelease: input.descriptor.dataUse as unknown as StableHashValue,
    suitability: {
      current: input.view.freshness.state === 'current',
      observedAt: input.view.freshness.state === 'current'
        ? input.view.freshness.observedAt
        : null,
    },
    authorityBoundary: {
      required: input.descriptor.authorityRequirement,
      accepted: input.view.acceptedAuthority !== undefined,
      dataUse: input.view.prepared?.dataUse as unknown as StableHashValue ?? null,
    },
    attempt: {
      idempotency: attempt?.idempotency as unknown as StableHashValue ?? null,
      release: attempt?.release as unknown as StableHashValue ?? null,
      retry,
    },
    evidence: {
      expected: input.descriptor.evidence.map(({ evidenceId }) => evidenceId),
      observed: result as unknown as StableHashValue ?? null,
    },
    disposition: {
      state: input.view.control.state,
      refusalOrUnknown: result?.failureCode
        ?? (input.view.observedResolution.state === 'timed_out' ? 'provider_timeout' : null),
    },
    continuations: [...input.descriptor.safeContinuations],
  }
  const semanticDigest = canonicalDigest(semantics as unknown as StableHashValue)
  return {
    rich: {
      kind: 'human_rich_task',
      title: input.descriptor.name,
      sections: [
        { label: 'What is available', value: semantics.operation },
        { label: 'What is needed', value: semantics.missingInformation },
        { label: 'What happens', value: {
          consequence: semantics.consequence,
          price: semantics.price,
          dataRelease: semantics.dataRelease,
        } },
        { label: 'What you can do next', value: semantics.continuations },
      ],
      semantics,
      semanticDigest,
    },
    structured: { kind: 'external_agent_task', semantics, semanticDigest },
  }
}

export function requiredFields(schema: StableHashValue): readonly string[] {
  if (!isRecord(schema) || !Array.isArray(schema.required)) return []
  return schema.required.filter((value): value is string => typeof value === 'string')
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}
