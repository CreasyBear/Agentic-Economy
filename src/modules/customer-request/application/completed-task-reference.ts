import type { CompletedResultIdentity } from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  CustomerRequestCompletedTaskReference,
  CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'

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
  // The producer (readCompletedResultIdentity) already enforces referenceability, but its
  // businessOutcome is typed `string` because a provider may mark any terminal outcome
  // referenceable via terminalResultReferenceable. Narrow at this boundary without refusing.
  const businessOutcome = identity.businessOutcome as CustomerRequestCompletedTaskReference['businessOutcome']


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
    businessOutcome,
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
