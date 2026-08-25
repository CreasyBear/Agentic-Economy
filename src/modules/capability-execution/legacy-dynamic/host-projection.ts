import { materializeRuntimePublishedOperation } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { dynamicPublishedSourceDigest } from './dynamic-published-contract'
import { inspectUserInputContract } from './input-work'
import { assertDynamicPublishedSnapshotShape } from './dynamic-published-snapshot-verifier'
import type { ActionInvocationOrigin, InvocationActor } from '@/modules/action-invocation/runtime'
export {
  projectRichPaidOperation,
  projectStructuredPaidOperation,
} from './paid-operation-semantics'
export type {
  RichPaidOperationProjection,
  StructuredPaidOperationProjection,
} from './paid-operation-semantics'

export type InvocationTaskSemantics = Readonly<{
  identity: Readonly<{
    invocationRef: string
    invocationVersion: number
    origin: ActionInvocationOrigin
    owner: InvocationActor
  }>
  operation: Readonly<{ id: string; version: string; name: string; summary: string }>
  information: Readonly<{
    required: readonly string[]
    missing: readonly string[]
    knownDigest: string
  }>
  consequence: StableHashValue
  price: StableHashValue
  dataRelease: StableHashValue
  suitability: Readonly<{ sourceCurrent: boolean; readinessValidUntil: number }>
  authority: Readonly<{
    required: string
    accepted: boolean
    reference: string | null
    bounds: StableHashValue
  }>
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

export function projectRichInvocationTask(input: Readonly<{
  invocationRef: string
  expectedInvocationVersion: number
  snapshot: unknown
}>): RichInvocationTaskProjection {
  const semantics = resolveSemantics(input)
  return {
    kind: 'human_rich_task',
    title: semantics.operation.name,
    sections: [
      { label: 'Available operation', value: semantics.operation },
      { label: 'Required information', value: semantics.information },
      { label: 'Consequences and price', value: {
        consequence: semantics.consequence,
        price: semantics.price,
        dataRelease: semantics.dataRelease,
      } },
      { label: 'Authority and recovery', value: {
        authority: semantics.authority,
        attempt: semantics.attempt,
        continuations: semantics.continuations,
      } },
    ],
    semantics,
    semanticDigest: canonicalDigest(semantics),
  }
}

export function projectStructuredInvocationTask(input: Readonly<{
  invocationRef: string
  expectedInvocationVersion: number
  snapshot: unknown
}>): StructuredInvocationTaskProjection {
  const semantics = resolveSemantics(input)
  return {
    kind: 'external_agent_task',
    semantics,
    semanticDigest: canonicalDigest(semantics),
  }
}

function resolveSemantics(input: Readonly<{
  invocationRef: string
  expectedInvocationVersion: number
  snapshot: unknown
}>): InvocationTaskSemantics {
  const snapshot = structuredClone(input.snapshot)
  assertDynamicPublishedSnapshotShape(snapshot)
  const operation = snapshot.operations?.[0]
  const control = snapshot.controls.find((row) => row.invocationRef === input.invocationRef)
  const work = snapshot.inputWork?.find((row) => row.invocationRef === input.invocationRef)
  if (operation === undefined || control === undefined || work === undefined
    || control.invocationVersion !== input.expectedInvocationVersion) {
    throw new Error('invocation_projection_stale_or_missing')
  }
  const descriptor = materializeRuntimePublishedOperation(operation)
  const inputContract = inspectUserInputContract(operation)
  if (descriptor.id !== control.control.action.id
    || descriptor.version !== control.control.action.contractVersion
    || work?.sourceMaterialDigest !== dynamicPublishedSourceDigest(operation, descriptor)
    || work.operationId !== operation.operationId
    || work.operationVersion !== descriptor.version) {
    throw new Error('invocation_projection_source_invalid')
  }
  if (canonicalDigest(work.requiredFields)
    !== canonicalDigest(inputContract.requiredFields)) {
    throw new Error('invocation_projection_input_contract_invalid')
  }
  const source = snapshot.sourceRows.find((row) => row.invocationRef === input.invocationRef)
  if (work.state === 'prepared' && source === undefined) {
    throw new Error('invocation_projection_prepared_source_missing')
  }
  if (source !== undefined
    && (canonicalDigest(source.operation)
      !== canonicalDigest(operation)
      || source.input.inputDigest !== canonicalDigest(source.input.input)
      || canonicalDigest(work.origin)
        !== canonicalDigest(control.control.origin)
      || canonicalDigest(work.owner)
        !== canonicalDigest(control.control.owner)
      || (source.origin !== undefined
        && canonicalDigest(source.origin)
          !== canonicalDigest(control.control.origin))
      || (source.owner !== undefined
        && canonicalDigest(source.owner)
          !== canonicalDigest(control.control.owner)))) {
    throw new Error('invocation_projection_source_invalid')
  }
  const attempts = snapshot.attempts.find((group) => group.invocationRef === input.invocationRef)?.rows ?? []
  const attempt = attempts.at(-1)
  const result = source?.observedResolution.state === 'returned'
    ? source.observedResolution.result
    : undefined
  const retry = attempt?.outcome.state === 'timed_out' || attempt?.outcome.state === 'uncertain'
    ? 'reconcile_before_retry'
    : attempt?.outcome.state === 'failed'
      ? attempt.outcome.retry
      : descriptor.retryClass
  return {
    identity: {
      invocationRef: control.invocationRef,
      invocationVersion: control.invocationVersion,
      origin: control.control.origin,
      owner: control.control.owner,
    },
    operation: {
      id: descriptor.id,
      version: descriptor.version,
      name: descriptor.name,
      summary: descriptor.summary,
    },
    information: {
      required: work.requiredFields,
      missing: work.missingFields,
      knownDigest: canonicalDigest(work.knownInput),
    },
    consequence: toStableHashValue(descriptor.effects),
    price: toStableHashValue(descriptor.price),
    dataRelease: toStableHashValue(descriptor.dataUse),
    suitability: {
      sourceCurrent: source === undefined || source.input.sourceSnapshotDigest === work.sourceMaterialDigest,
      readinessValidUntil: operation.readiness.validUntil,
    },
    authority: {
      required: descriptor.authorityRequirement,
      accepted: control.control.acceptedAuthority !== undefined,
      reference: control.control.authority?.reference ?? null,
      bounds: toStableHashValue(control.authorityBinding ?? null),
    },
    attempt: {
      idempotency: toStableHashValue(attempt?.idempotency ?? null),
      release: toStableHashValue(attempt?.release ?? null),
      retry,
    },
    evidence: {
      expected: descriptor.evidence.map(({ evidenceId }) => evidenceId),
      observed: toStableHashValue(result ?? null),
    },
    disposition: {
      state: control.control.control.state,
      refusalOrUnknown: result?.failureCode
        ?? (source?.observedResolution.state === 'timed_out' ? 'provider_timeout' : null),
    },
    continuations: work.state === 'gathering_information'
      ? ['answer_missing_information']
      : [...descriptor.safeContinuations],
  }
}

function toStableHashValue(value: unknown): StableHashValue {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) return value.map(toStableHashValue)
  if (typeof value === 'object') {
    const record: { [key: string]: StableHashValue } = {}
    for (const [key, entry] of Object.entries(value)) {
      record[key] = toStableHashValue(entry)
    }
    return record
  }
  throw new Error('invocation_projection_value_invalid')
}
