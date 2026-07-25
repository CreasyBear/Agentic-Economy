import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { projectNeedsAttention } from '@/modules/customer-request/customer-projection'

import { bindRequirementAnswer, rebindStoredFacts } from '../interpret-compile'
import type {
  ProvideFactsAggregate,
  ProvideFactsInput,
  ProvideFactsPorts,
  ProvideFactsResult,
} from './types'

export async function provideCustomerRequestFacts(
  input: ProvideFactsInput,
  ports: ProvideFactsPorts,
): Promise<ProvideFactsResult> {
  const replay = await ports.replayCommittedCommand({
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    requestId: input.requestRef,
    principalId: input.principalId,
  })
  if (replay !== undefined) return replay
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== input.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  const recoveryBlock = await ports.recoverUnresolvedEgress(current.aggregate)
  if (recoveryBlock !== undefined) return recoveryBlock
  if (current.aggregate.snapshot.revision !== input.expectedRevision) {
    return {
      kind: 'conflict', requestRef: input.requestRef, reason: 'revision_changed',
    }
  }
  const requirement = current.aggregate.evaluation.nextRequirement
  if (requirement?.kind !== 'contract_fact' || requirement.requirementKey !== input.requirementKey) {
    return projectNeedsAttention({
      requestRef: input.requestRef, revision: input.expectedRevision,
      summary: 'Answer the current question before continuing.',
    })
  }
  const graph = await ports.loadRequestGraph(current.aggregate.snapshot.networkId)
  if (graph.kind !== 'available') return { kind: 'refused', reason: 'capabilities_unavailable' }
  if (graph.registrySnapshotDigest !== current.aggregate.evaluation.registrySnapshotDigest) {
    return projectNeedsAttention({
      requestRef: input.requestRef, revision: input.expectedRevision,
      summary: 'The available options changed. Review the request again before answering.',
    })
  }
  const answerFacts = bindRequirementAnswer(
    requirement, input.value, graph.models, input.expectedRevision + 1,
  )
  if (answerFacts === undefined) {
    return projectNeedsAttention({
      requestRef: input.requestRef, revision: input.expectedRevision,
      summary: 'That answer does not match the requested information.',
    })
  }
  const selections = current.aggregate.plan.actions.flatMap((action: ProvideFactsAggregate['plan']['actions'][number]) => {
    const model = graph.models.find((candidate) => (
      sameCapabilityContractRef(candidate.contractRef, action.contractRef)
    ))
    if (model === undefined || model.selectionKey !== action.selectionKey
      || model.semanticDigest !== action.semanticDigest) return []
    return [{
      selectionKey: model.selectionKey,
      contractRef: model.contractRef,
      facts: answerFacts.filter((fact) => fact.selectionKey === model.selectionKey
        && sameCapabilityContractRef(fact.contractRef, model.contractRef)),
    }]
  })
  const proposal = { kind: 'capability_candidates' as const, selections }
  const expectedRouteGeneration = await ports.loadCurrentRouteGenerationNumber(current)
  if (expectedRouteGeneration === undefined) {
    return projectNeedsAttention({
      requestRef: input.requestRef, revision: input.expectedRevision,
      summary: 'AE could not verify the current options. Try this request again.',
    })
  }
  return await ports.compileCommit({
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    requestId: input.requestRef,
    expectedRevision: input.expectedRevision,
    expectedRouteGeneration,
    principalId: input.principalId,
    delegatedAgentId: current.aggregate.snapshot.delegatedAgentId,
    intent: current.aggregate.snapshot.intent,
    networkId: current.aggregate.snapshot.networkId,
    priorFacts: rebindStoredFacts(current.aggregate.snapshot.facts as never, graph.models),
    proposal,
    interpreterId: 'customer:requirement-answer',
    graph,
    now: Date.now(),
  })
}
