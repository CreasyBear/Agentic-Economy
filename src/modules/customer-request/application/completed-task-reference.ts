import type { CompletedResultIdentity } from '@/modules/action-invocation'
import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  CustomerRequestCompletedTaskReference,
  CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  compileCustomerRequest,
  writableCustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  writableCustomerRequestRoutePlanGeneration,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import type { CommitAggregateResult } from '@/modules/customer-request/v2-write'

import { rebindStoredFacts, type RequestGraph } from './interpret-compile'

export type AttachCompletedTaskReferenceInput = Readonly<{
  principalRef: string
  callerRef: string
  invocationRef: string
  referencedAt: number
  candidateAggregate: CustomerRequestV2Aggregate
}>

export type AttachCompletedTaskReferencePorts = Readonly<{
  readCompletedResultIdentity(input: Readonly<{
    invocationRef: string
    actor: Readonly<{ principalRef: string; callerRef: string }>
  }>): CompletedResultIdentity
}>

export type AttachCompletedTaskReferenceResult =
  | Readonly<{
      kind: 'attached' | 'replayed'
      aggregate: CustomerRequestV2Aggregate
      reference: CustomerRequestCompletedTaskReference
      noEffect: true
    }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'request_not_owned'
        | 'invocation_not_found'
        | 'cross_principal_refused'
        | 'request_owned_refused'
        | 'invocation_not_terminal'
        | 'outcome_not_referenceable'
        | 'source_result_mismatch'
    }>

export type PersistCompletedTaskReferenceInput = Readonly<{
  requestRef: string
  expectedRevision: number
  expectedRouteGeneration: number
  principalRef: string
  callerRef: string
  invocationRef: string
  commandKey: string
  commandDigest: string
  referencedAt: number
}>

export type PersistCompletedTaskReferencePorts = AttachCompletedTaskReferencePorts & Readonly<{
  replayCommittedAttachment(input: Readonly<{
    commandKey: string
    commandDigest: string
    requestRef: string
    principalRef: string
  }>): Promise<
    | Readonly<{ kind: 'not_found' }>
    | Readonly<{ kind: 'conflict' }>
    | Readonly<{ kind: 'found'; aggregate: CustomerRequestV2Aggregate }>
  >
  loadCurrent(requestRef: string): Promise<
    | Readonly<{ kind: 'not_found' }>
    | Readonly<{
        kind: 'current'
        aggregate: CustomerRequestV2Aggregate
        routeGenerationNumber: number
      }>
  >
  loadRequestGraph(networkId: string): Promise<RequestGraph | Readonly<{ kind: 'unavailable' }>>
  commitAggregate(input: Readonly<{
    commandKey: string
    commandDigest: string
    expectedRevision: number
    expectedRouteGeneration: number
    aggregate: ReturnType<typeof writableCustomerRequestV2Aggregate>
    routeGeneration?: ReturnType<typeof writableCustomerRequestRoutePlanGeneration>
  }>): Promise<CommitAggregateResult>
  loadPersistedRevision(input: Readonly<{
    requestRef: string
    revision: number
  }>): Promise<CustomerRequestV2Aggregate | null>
}>

export type PersistCompletedTaskReferenceResult =
  | Readonly<{
      kind: 'stored' | 'replayed'
      requestRef: string
      revision: number
      aggregate: CustomerRequestV2Aggregate
      routeGeneration?: CustomerRequestRoutePlanGeneration
      noEffect: true
      matchingEffect: 'provenance_only'
    }>
  | Readonly<{ kind: 'conflict'; reason: 'revision_changed' | 'idempotency_key_reused' | 'identity_changed' }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'request_not_owned'
        | 'invocation_not_found'
        | 'cross_principal_refused'
        | 'request_owned_refused'
        | 'invocation_not_terminal'
        | 'outcome_not_referenceable'
        | 'source_result_mismatch'
        | 'capabilities_unavailable'
        | 'aggregate_invalid'
        | 'persisted_readback_failed'
    }>

/**
 * Adds verified prior work to an otherwise complete canonical V2 revision.
 * It reads invocation identity only: authority, attempts, control and raw
 * action results cannot cross this boundary.
 */
export function attachCompletedTaskReference(
  input: AttachCompletedTaskReferenceInput,
  ports: AttachCompletedTaskReferencePorts,
): AttachCompletedTaskReferenceResult {
  if (input.candidateAggregate.snapshot.principalId !== input.principalRef) {
    return { kind: 'refused', reason: 'request_not_owned' }
  }
  const identity = ports.readCompletedResultIdentity({
    invocationRef: input.invocationRef,
    actor: { principalRef: input.principalRef, callerRef: input.callerRef },
  })
  if (identity.kind === 'refused') return { kind: 'refused', reason: identity.code }

  const referenceRef = `completed-task:${canonicalDigest({
    invocationRef: identity.invocationRef,
    sourceResultRef: identity.sourceResultRef,
    resultDigest: identity.resultDigest,
  })}`
  const existing = input.candidateAggregate.completedTaskReferences?.find(
    (reference) => reference.referenceRef === referenceRef,
  )
  if (existing !== undefined) {
    return { kind: 'replayed', aggregate: input.candidateAggregate, reference: existing, noEffect: true }
  }
  const reference: CustomerRequestCompletedTaskReference = Object.freeze({
    role: 'prior_completed_task',
    referenceRef,
    invocationRef: identity.invocationRef,
    actionId: identity.actionId,
    actionVersion: identity.actionVersion,
    sourceResultRef: identity.sourceResultRef,
    resultDigest: identity.resultDigest,
    businessOutcome: identity.businessOutcome,
    referencedAt: input.referencedAt,
  })
  const { aggregateDigest: _priorDigest, ...priorMaterial } = input.candidateAggregate
  const aggregateMaterial = {
    ...priorMaterial,
    completedTaskReferences: Object.freeze([
      ...(input.candidateAggregate.completedTaskReferences ?? []),
      reference,
    ]),
  }
  return {
    kind: 'attached',
    aggregate: Object.freeze({
      ...aggregateMaterial,
      aggregateDigest: canonicalDigest(aggregateMaterial as never),
    }),
    reference,
    noEffect: true,
  }
}

export async function persistCompletedTaskReference(
  input: PersistCompletedTaskReferenceInput,
  ports: PersistCompletedTaskReferencePorts,
): Promise<PersistCompletedTaskReferenceResult> {
  const replay = await ports.replayCommittedAttachment({
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    requestRef: input.requestRef,
    principalRef: input.principalRef,
  })
  if (replay.kind === 'conflict') return { kind: 'conflict', reason: 'idempotency_key_reused' }
  if (replay.kind === 'found') {
    return success('replayed', input.requestRef, replay.aggregate, undefined)
  }

  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind !== 'current'
    || current.aggregate.snapshot.principalId !== input.principalRef) {
    return { kind: 'refused', reason: 'request_not_owned' }
  }
  if (current.aggregate.snapshot.revision !== input.expectedRevision
    || current.routeGenerationNumber !== input.expectedRouteGeneration) {
    return { kind: 'conflict', reason: 'revision_changed' }
  }
  const identity = ports.readCompletedResultIdentity({
    invocationRef: input.invocationRef,
    actor: { principalRef: input.principalRef, callerRef: input.callerRef },
  })
  if (identity.kind === 'refused') return { kind: 'refused', reason: identity.code }
  const referenceRef = completedTaskReferenceRef(identity)
  if (current.aggregate.completedTaskReferences?.some(
    (reference) => reference.referenceRef === referenceRef,
  )) return success('replayed', input.requestRef, current.aggregate, undefined)

  const graph = await ports.loadRequestGraph(current.aggregate.snapshot.networkId)
  if (graph.kind !== 'available') return { kind: 'refused', reason: 'capabilities_unavailable' }
  const priorFacts = rebindStoredFacts(current.aggregate.snapshot.facts as never, graph.models)
  const selections = current.aggregate.plan.actions.flatMap((action) => {
    const model = graph.models.find((candidate) => (
      sameCapabilityContractRef(candidate.contractRef, action.contractRef)
      && candidate.selectionKey === action.selectionKey
      && candidate.semanticDigest === action.semanticDigest
    ))
    if (model === undefined) return []
    return [{
      selectionKey: model.selectionKey,
      contractRef: model.contractRef,
      facts: priorFacts.filter((fact) => fact.selectionKey === model.selectionKey
        && sameCapabilityContractRef(fact.contractRef, model.contractRef)),
    }]
  })
  if (selections.length !== current.aggregate.plan.actions.length) {
    return { kind: 'refused', reason: 'capabilities_unavailable' }
  }
  const compiled = compileCustomerRequest({
    requestId: input.requestRef,
    expectedRevision: input.expectedRevision,
    expectedRouteGeneration: input.expectedRouteGeneration,
    principalId: input.principalRef,
    delegatedAgentId: current.aggregate.snapshot.delegatedAgentId,
    intent: current.aggregate.snapshot.intent,
    networkId: current.aggregate.snapshot.networkId,
    ...(priorFacts.length === 0 ? {} : { priorFacts }),
    ...(current.aggregate.snapshot.routeExclusions === undefined ? {} : {
      routeExclusions: current.aggregate.snapshot.routeExclusions,
    }),
    proposal: { kind: 'capability_candidates', selections },
    interpreterId: 'customer:attach-completed-task',
    bindings: graph.bindings,
    models: graph.models,
    now: input.referencedAt,
  })
  if (compiled.kind === 'refused') return { kind: 'refused', reason: 'aggregate_invalid' }
  const candidate = withCompletedTaskReferences(
    compiled.aggregate,
    current.aggregate.completedTaskReferences ?? [],
  )
  const attached = attachCompletedTaskReference({
    principalRef: input.principalRef,
    callerRef: input.callerRef,
    invocationRef: input.invocationRef,
    referencedAt: input.referencedAt,
    candidateAggregate: candidate,
  }, { readCompletedResultIdentity: () => identity })
  if (attached.kind === 'refused') return attached
  const committed = await ports.commitAggregate({
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    expectedRevision: input.expectedRevision,
    expectedRouteGeneration: input.expectedRouteGeneration,
    aggregate: writableCustomerRequestV2Aggregate(attached.aggregate),
    ...(compiled.routeGeneration === undefined ? {} : {
      routeGeneration: writableCustomerRequestRoutePlanGeneration(compiled.routeGeneration),
    }),
  })
  if (committed.kind === 'command_conflict') return { kind: 'conflict', reason: 'idempotency_key_reused' }
  if (committed.kind === 'identity_conflict') return { kind: 'conflict', reason: 'identity_changed' }
  if (committed.kind === 'revision_conflict' || committed.kind === 'route_generation_conflict') {
    return { kind: 'conflict', reason: 'revision_changed' }
  }
  if (committed.kind !== 'stored' && committed.kind !== 'replayed') {
    return { kind: 'refused', reason: 'aggregate_invalid' }
  }
  const persisted = await ports.loadPersistedRevision({
    requestRef: committed.requestId,
    revision: committed.revision,
  })
  if (persisted === null || persisted.aggregateDigest !== attached.aggregate.aggregateDigest) {
    return { kind: 'refused', reason: 'persisted_readback_failed' }
  }
  return success(
    committed.kind,
    committed.requestId,
    persisted,
    compiled.routeGeneration,
  )
}

function completedTaskReferenceRef(
  identity: Extract<CompletedResultIdentity, { kind: 'completed_result' }>,
): string {
  return `completed-task:${canonicalDigest({
    invocationRef: identity.invocationRef,
    sourceResultRef: identity.sourceResultRef,
    resultDigest: identity.resultDigest,
  })}`
}

function withCompletedTaskReferences(
  aggregate: CustomerRequestV2Aggregate,
  references: readonly CustomerRequestCompletedTaskReference[],
): CustomerRequestV2Aggregate {
  const { aggregateDigest: _digest, completedTaskReferences: _existing, ...material } = aggregate
  const next = {
    ...material,
    ...(references.length === 0 ? {} : { completedTaskReferences: Object.freeze([...references]) }),
  }
  return Object.freeze({ ...next, aggregateDigest: canonicalDigest(next as never) })
}

function success(
  kind: 'stored' | 'replayed',
  requestRef: string,
  aggregate: CustomerRequestV2Aggregate,
  routeGeneration: CustomerRequestRoutePlanGeneration | undefined,
): Extract<PersistCompletedTaskReferenceResult, { kind: 'stored' | 'replayed' }> {
  return {
    kind,
    requestRef,
    revision: aggregate.snapshot.revision,
    aggregate,
    ...(routeGeneration === undefined ? {} : { routeGeneration }),
    noEffect: true,
    matchingEffect: 'provenance_only',
  }
}
