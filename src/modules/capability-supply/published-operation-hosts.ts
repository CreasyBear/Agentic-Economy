import type { ActionInvocationOrigin, ActionInvocationView } from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { PublishedOperation, RuntimePublishedOperationDescriptor } from './published-operation'

export type PublishedOperationHostObservation = Readonly<{
  host: 'embedded_human' | 'external_agent'
  operationId: string
  operationVersion: string
  invocationRef: string
  invocationVersion: number
  origin: ActionInvocationOrigin
  originDigest: string
  owner: string
  principal: string
  actingActor: string
  delegation: 'none'
  effectGeneration: number
  provenance: Readonly<{ adapterId: string; observationRef: string }>
  materialDigest: string
  parametersDigest: string
  priceDigest: string
  paymentRecipient: string
  authorityDigest: string
  attemptsDigest: string
  evidenceDigest: string
  freshnessDigest: string
  uncertaintyDigest: string
  continuationsDigest: string
  semanticDigest: string
}>

export type PublishedOperationHostCommand = Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  invocation: ActionInvocationView
  input: unknown
  provenance: Readonly<{ adapterId: string; observationRef: string }>
}>

export function observeEmbeddedPublishedOperation(
  command: PublishedOperationHostCommand,
): PublishedOperationHostObservation {
  if (command.provenance.adapterId !== 'embedded_human') {
    throw new Error('published_operation_host_provenance_invalid')
  }
  return observe('embedded_human', command)
}

export function observeExternalPublishedOperation(
  command: PublishedOperationHostCommand,
): PublishedOperationHostObservation {
  if (command.provenance.adapterId !== 'external_agent') {
    throw new Error('published_operation_host_provenance_invalid')
  }
  return observe('external_agent', command)
}

export function comparePublishedOperationHostSemantics(
  left: PublishedOperationHostObservation,
  right: PublishedOperationHostObservation,
): Readonly<{ kind: 'pass' } | { kind: 'fail'; fields: readonly string[] }> {
  const semanticFields = [
    'operationId', 'operationVersion', 'invocationRef', 'invocationVersion', 'originDigest',
    'owner', 'principal', 'actingActor', 'delegation', 'effectGeneration', 'materialDigest',
    'parametersDigest', 'priceDigest', 'paymentRecipient', 'authorityDigest', 'attemptsDigest',
    'evidenceDigest', 'freshnessDigest', 'uncertaintyDigest', 'continuationsDigest',
  ] as const
  const fields: string[] = semanticFields.filter((field) => left[field] !== right[field])
  if (left.provenance.observationRef === right.provenance.observationRef) {
    fields.push('provenance')
  }
  return fields.length === 0 ? { kind: 'pass' } : { kind: 'fail', fields }
}

function observe(
  host: PublishedOperationHostObservation['host'],
  command: PublishedOperationHostCommand,
): PublishedOperationHostObservation {
  const preparedTarget = command.invocation.prepared?.target as
    | Readonly<Record<string, unknown>>
    | undefined
  if (command.invocation.action.id !== command.descriptor.id
    || command.invocation.action.contractVersion !== command.descriptor.version
    || preparedTarget === undefined
    || preparedTarget.materialDigest !== command.operation.materialDigest) {
    throw new Error('published_operation_invocation_not_anchored')
  }
  const actors = new Set(command.invocation.attempts.map(({ actor }) =>
    `${actor.principalRef}\u0000${actor.callerRef}`))
  if (actors.size > 1 || command.invocation.attempts.some(({ actor }) =>
    actor.principalRef !== command.invocation.owner.principalRef)) {
    throw new Error('published_operation_persisted_attribution_invalid')
  }
  const persistedActor = command.invocation.attempts.at(-1)?.actor ?? command.invocation.owner
  const effectGeneration = command.invocation.attempts.reduce(
    (highest, attempt) => Math.max(highest, attempt.effectGeneration),
    0,
  )
  const common = {
    operationId: command.operation.operationId,
    operationVersion: command.descriptor.version,
    invocationRef: command.invocation.invocationRef,
    invocationVersion: command.invocation.invocationVersion,
    originDigest: canonicalDigest(command.invocation.origin as StableHashValue),
    owner: command.invocation.owner.callerRef,
    principal: command.invocation.owner.principalRef,
    actingActor: persistedActor.callerRef,
    delegation: 'none' as const,
    effectGeneration,
    materialDigest: command.operation.materialDigest,
    parametersDigest: canonicalDigest(command.input as StableHashValue),
    priceDigest: canonicalDigest(command.operation.identity.price as StableHashValue),
    paymentRecipient: command.operation.identity.paymentRecipient,
    authorityDigest: canonicalDigest({
      authority: command.invocation.authority,
      principalRef: command.invocation.owner.principalRef,
    } as StableHashValue),
    attemptsDigest: canonicalDigest(command.invocation.attempts as StableHashValue),
    evidenceDigest: command.operation.identity.evidenceDigest,
    freshnessDigest: canonicalDigest(command.operation.readiness as StableHashValue),
    uncertaintyDigest: canonicalDigest({
      control: command.invocation.control,
      resolution: command.invocation.observedResolution,
    } as StableHashValue),
    continuationsDigest: canonicalDigest(command.descriptor.safeContinuations as StableHashValue),
  }
  return {
    host,
    ...common,
    origin: command.invocation.origin,
    provenance: command.provenance,
    semanticDigest: canonicalDigest(common as StableHashValue),
  }
}
