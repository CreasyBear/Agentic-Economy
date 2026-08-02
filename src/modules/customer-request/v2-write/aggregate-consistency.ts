import {
  isBoundedJsonValue,
  sameCapabilityContractRef,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'

const MAX_AGGREGATE_BYTES = 700_000

export function aggregateIsInternallyConsistent(
  aggregate: CustomerRequestV2Aggregate,
  expectedRevision: number,
): boolean {
  const { aggregateDigest: _aggregateDigest, ...material } = aggregate
  const outcomeIsConsistent = aggregate.evaluation.posture === 'unsupported'
    ? aggregate.outcome === 'unsupported'
    : aggregate.evaluation.posture === 'needs_information'
      ? aggregate.outcome === 'needs_information'
      : aggregate.outcome === 'plan_ready' || aggregate.outcome === 'unsupported'
  return aggregate.aggregateVersion === 2
    && aggregateByteLengthWithinLimit(aggregate)
    && aggregate.snapshot.revision === expectedRevision + 1
    && aggregate.evaluation.requestId === aggregate.snapshot.requestId
    && aggregate.evaluation.requestRevision === aggregate.snapshot.revision
    && aggregate.plan.requestId === aggregate.snapshot.requestId
    && aggregate.plan.requestRevision === aggregate.snapshot.revision
    && aggregate.plan.registrySnapshotDigest === aggregate.evaluation.registrySnapshotDigest
    && outcomeIsConsistent
    && aggregate.snapshot.facts.length <= 128
    && (aggregate.snapshot.routeExclusions?.length ?? 0) <= 256
    && (aggregate.snapshot.routeExclusions ?? []).every((exclusion) => (
      exclusion.choiceSignature.startsWith('sha256:')
      && exclusion.reportedRouteRef.length > 0
      && exclusion.reportedRouteRef.length <= 300
      && exclusion.reportedGenerationRef.length > 0
      && exclusion.reportedGenerationRef.length <= 300
      && exclusion.reason.trim().length > 0
      && exclusion.reason.length <= 2_000
      && exclusion.recordedAtRevision >= 2
      && exclusion.recordedAtRevision <= aggregate.snapshot.revision
    ))
    && aggregate.evaluation.facts.length <= 128
    && aggregate.plan.actions.length <= 64
    && (aggregate.completedTaskReferences?.length ?? 0) <= 64
    && (aggregate.completedTaskReferences ?? []).every((reference) => (
      reference.role === 'prior_completed_task'
      && reference.referenceRef === `completed-task:${canonicalDigest({
        invocationRef: reference.invocationRef,
        sourceResultRef: reference.sourceResultRef,
        resultDigest: reference.resultDigest,
      })}`
      && reference.invocationRef.length > 0
      && reference.actionId.length > 0
      && reference.actionVersion.length > 0
      && reference.sourceResultRef.length > 0
      && reference.resultDigest.startsWith('sha256:')
      && Number.isFinite(reference.referencedAt)
    ))
    && new Set((aggregate.completedTaskReferences ?? []).map(({ referenceRef }) => referenceRef)).size
      === (aggregate.completedTaskReferences?.length ?? 0)
    && (aggregate.importedCommitmentReferences?.length ?? 0) <= 64
    && (aggregate.importedCommitmentReferences ?? []).every((reference) => (
      reference.role === 'imported_commitment_claim'
      && reference.referenceRef === `imported-commitment:${canonicalDigest({
        claimRef: reference.claimRef,
        claimDigest: reference.claimDigest,
      })}`
      && reference.claimRef.length > 0
      && reference.claimDigest.startsWith('sha256:')
      && reference.issuerRef.length > 0
      && reference.observerRef.length > 0
      && reference.subject.kind.length > 0
      && reference.subject.ref.length > 0
      && reference.commitmentKind.length > 0
      && reference.source.system.length > 0
      && reference.source.reference.length > 0
      && reference.source.digest.startsWith('sha256:')
      && reference.evidenceRefs.length > 0
      && reference.verification === 'imported_unverified'
      && reference.observationPosture === 'imported_claim_only'
      && Number.isFinite(reference.observedAt)
      && Number.isFinite(reference.referencedAt)
    ))
    && new Set((aggregate.importedCommitmentReferences ?? []).map(({ referenceRef }) => referenceRef)).size
      === (aggregate.importedCommitmentReferences?.length ?? 0)
    && aggregate.evaluation.candidates.length <= 256
    && aggregate.snapshot.facts.every(({ value }) => isBoundedJsonValue(value))
    && aggregate.evaluation.facts.every(({ value }) => isBoundedJsonValue(value))
    && aggregate.evaluation.criteria.every(({ value }) => isBoundedJsonValue(value))
    && canonicalDigest(aggregate.snapshot.facts as StableHashValue) === aggregate.evaluation.factsDigest
    && canonicalDigest(aggregate.snapshot.facts as StableHashValue)
      === canonicalDigest(aggregate.evaluation.facts as StableHashValue)
    && canonicalDigest({
      requestId: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      principalId: aggregate.snapshot.principalId,
      delegatedAgentId: aggregate.snapshot.delegatedAgentId,
      intent: aggregate.snapshot.intent,
      networkId: aggregate.snapshot.networkId,
      facts: aggregate.snapshot.facts,
      ...(aggregate.snapshot.routeExclusions === undefined
        ? {}
        : { routeExclusions: aggregate.snapshot.routeExclusions }),
    } as StableHashValue) === aggregate.snapshot.snapshotDigest
    && planAuthorityIsConsistent(aggregate)
    && completionAuthorityIsConsistent(aggregate)
    && canonicalDigest(material as StableHashValue) === aggregate.aggregateDigest
}


function planAuthorityIsConsistent(aggregate: CustomerRequestV2Aggregate): boolean {
  const ordinals = new Map([...aggregate.plan.actions]
    .sort((left, right) => left.selectionKey.localeCompare(right.selectionKey))
    .map((action, ordinal) => [action.actionId, ordinal]))
  const expectedActions = aggregate.plan.actions.map((action) => {
    const ordinal = ordinals.get(action.actionId)
    if (ordinal === undefined) return undefined
    const actionMaterial = {
      requestId: aggregate.snapshot.requestId,
      requestRevision: aggregate.snapshot.revision,
      ordinal,
      contractRef: action.contractRef,
      selectionKey: action.selectionKey,
      semanticDigest: action.semanticDigest,
    }
    const inputs = aggregate.snapshot.facts.filter((fact) => fact.selectionKey === action.selectionKey
      && sameCapabilityContractRef(fact.contractRef, action.contractRef))
    return {
      actionId: `action:${canonicalDigest(actionMaterial)}`,
      contractRef: action.contractRef,
      selectionKey: action.selectionKey,
      semanticDigest: action.semanticDigest,
      dependsOn: action.dependsOn,
      inputs,
      inputMappings: action.inputMappings,
    }
  })
  if (expectedActions.some((action) => action === undefined)) return false
  if (canonicalDigest(expectedActions as StableHashValue)
    !== canonicalDigest(aggregate.plan.actions as StableHashValue)) {
    return false
  }
  const proposalDigest = canonicalDigest({
    interpreterId: aggregate.plan.interpreterId,
    selected: [...aggregate.plan.actions]
      .sort((left, right) => left.selectionKey.localeCompare(right.selectionKey))
      .map(({ selectionKey, contractRef }) => ({ selectionKey, contractRef })),
    facts: aggregate.snapshot.facts,
  })
  const planMaterial = {
    requestId: aggregate.snapshot.requestId,
    requestRevision: aggregate.snapshot.revision,
    proposedByAgentId: aggregate.snapshot.delegatedAgentId,
    interpreterId: aggregate.plan.interpreterId,
    interpretationEvidence: aggregate.plan.interpretationEvidence,
    proposalDigest,
    registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
    actions: aggregate.plan.actions,
    completionRequirements: aggregate.evaluation.completionRequirements,
    compilerVersion: CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION,
    authority: 'proposal_only' as const,
  }
  const planDigest = canonicalDigest(planMaterial)
  return aggregate.plan.proposedByAgentId === aggregate.snapshot.delegatedAgentId
    && aggregate.plan.proposalDigest === proposalDigest
    && aggregate.plan.compilerVersion === CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION
    && aggregate.plan.authority === 'proposal_only'
    && aggregate.plan.planDigest === planDigest
    && aggregate.plan.planRevisionId === `plan:${planDigest}`
    && aggregate.plan.createdAt === aggregate.snapshot.recordedAt
}

function completionAuthorityIsConsistent(aggregate: CustomerRequestV2Aggregate): boolean {
  if (canonicalDigest(aggregate.plan.completionRequirements as StableHashValue)
    !== canonicalDigest(aggregate.evaluation.completionRequirements as StableHashValue)) {
    return false
  }
  return aggregate.plan.completionRequirements.every((requirement) => {
    const action = aggregate.plan.actions.find(({ actionId }) => actionId === requirement.actionId)
    return action !== undefined
      && canonicalDigest(action.contractRef) === canonicalDigest(requirement.contractRef)
  })
}

function aggregateByteLengthWithinLimit(aggregate: CustomerRequestV2Aggregate): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(aggregate)).byteLength <= MAX_AGGREGATE_BYTES
  } catch {
    return false
  }
}
