import type { ActionInvocationOrigin, ActionInvocationView, InvocationActor } from '@/modules/action-invocation'
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
  actor: InvocationActor
  owner: string
  principal: string
  actingActor: string
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
  actor: InvocationActor
  origin: ActionInvocationOrigin
  paymentRecipient: string
}>

export function observeEmbeddedPublishedOperation(
  command: PublishedOperationHostCommand,
): PublishedOperationHostObservation {
  if (command.origin.kind !== 'request_owned') throw new Error('embedded_origin_must_be_request_owned')
  return observe('embedded_human', command)
}

export function observeExternalPublishedOperation(
  command: PublishedOperationHostCommand,
): PublishedOperationHostObservation {
  if (command.origin.kind !== 'standalone') throw new Error('external_origin_must_be_standalone')
  return observe('external_agent', command)
}

export function comparePublishedOperationHostSemantics(
  left: PublishedOperationHostObservation,
  right: PublishedOperationHostObservation,
): Readonly<{ kind: 'pass' } | { kind: 'fail'; fields: readonly string[] }> {
  const semanticFields = [
    'operationId', 'operationVersion', 'owner', 'principal', 'actingActor', 'materialDigest',
    'parametersDigest', 'priceDigest', 'paymentRecipient', 'authorityDigest', 'attemptsDigest',
    'evidenceDigest', 'freshnessDigest', 'uncertaintyDigest', 'continuationsDigest',
  ] as const
  const fields = semanticFields.filter((field) => left[field] !== right[field])
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
  const common = {
    operationId: command.operation.operationId,
    operationVersion: command.descriptor.version,
    owner: command.actor.principalRef,
    principal: command.actor.principalRef,
    actingActor: command.actor.callerRef,
    materialDigest: command.operation.materialDigest,
    parametersDigest: canonicalDigest(command.input as StableHashValue),
    priceDigest: canonicalDigest(command.operation.identity.price as StableHashValue),
    paymentRecipient: command.paymentRecipient,
    authorityDigest: canonicalDigest({
      authority: command.invocation.authority,
      principalRef: command.actor.principalRef,
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
    invocationRef: command.invocation.invocationRef,
    invocationVersion: command.invocation.invocationVersion,
    origin: command.origin,
    actor: command.actor,
    semanticDigest: canonicalDigest(common as StableHashValue),
  }
}
