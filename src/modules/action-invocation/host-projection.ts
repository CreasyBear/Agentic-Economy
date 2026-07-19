import { materializeRuntimePublishedOperation } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { dynamicPublishedSourceDigest } from './dynamic-published-contract'
import { inspectUserInputContract } from './input-work'

export type InvocationProjectionResolver = Readonly<{
  resolve(invocationRef: string): unknown
}>

export type InvocationTaskSemantics = Readonly<{
  identity: Readonly<{ invocationRef: string; invocationVersion: number }>
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
  resolver: InvocationProjectionResolver
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
    semanticDigest: canonicalDigest(semantics as unknown as StableHashValue),
  }
}

export function projectStructuredInvocationTask(input: Readonly<{
  invocationRef: string
  expectedInvocationVersion: number
  resolver: InvocationProjectionResolver
}>): StructuredInvocationTaskProjection {
  const semantics = resolveSemantics(input)
  return {
    kind: 'external_agent_task',
    semantics,
    semanticDigest: canonicalDigest(semantics as unknown as StableHashValue),
  }
}

function resolveSemantics(input: Readonly<{
  invocationRef: string
  expectedInvocationVersion: number
  resolver: InvocationProjectionResolver
}>): InvocationTaskSemantics {
  const snapshot = JSON.parse(JSON.stringify(
    input.resolver.resolve(input.invocationRef),
  )) as {
    operations?: any[]
    controls: any[]
    inputWork?: any[]
    sourceRows: any[]
    attempts: any[]
  }
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
  if (canonicalDigest(work.requiredFields as unknown as StableHashValue)
    !== canonicalDigest(inputContract.requiredFields as unknown as StableHashValue)) {
    throw new Error('invocation_projection_input_contract_invalid')
  }
  const source = snapshot.sourceRows.find((row) => row.invocationRef === input.invocationRef)
  if (work.state === 'prepared' && source === undefined) {
    throw new Error('invocation_projection_prepared_source_missing')
  }
  if (source !== undefined
    && (canonicalDigest(source.operation as unknown as StableHashValue)
      !== canonicalDigest(operation as unknown as StableHashValue)
      || source.input.inputDigest !== canonicalDigest(source.input.input))) {
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
      knownDigest: canonicalDigest(work.knownInput as unknown as StableHashValue),
    },
    consequence: descriptor.effects as unknown as StableHashValue,
    price: descriptor.price as unknown as StableHashValue,
    dataRelease: descriptor.dataUse as unknown as StableHashValue,
    suitability: {
      sourceCurrent: source === undefined || source.input.sourceSnapshotDigest === work.sourceMaterialDigest,
      readinessValidUntil: operation.readiness.validUntil,
    },
    authority: {
      required: descriptor.authorityRequirement,
      accepted: control.control.acceptedAuthority !== undefined,
      reference: control.control.authority?.reference ?? null,
      bounds: control.authorityBinding as unknown as StableHashValue ?? null,
    },
    attempt: {
      idempotency: attempt?.idempotency as unknown as StableHashValue ?? null,
      release: attempt?.release as unknown as StableHashValue ?? null,
      retry,
    },
    evidence: {
      expected: descriptor.evidence.map(({ evidenceId }) => evidenceId),
      observed: result as unknown as StableHashValue ?? null,
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
