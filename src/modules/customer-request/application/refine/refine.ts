import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { routeChoiceSignature } from '@/modules/customer-request/compiler'
import { projectNeedsAttention } from '@/modules/customer-request/customer-projection'
import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'

import { rebindStoredFacts } from '../interpret-compile'
import type {
  RefineCustomerRequestInput,
  RefineCustomerRequestPorts,
  RefineCustomerRequestResult,
} from './types'

export async function refineCustomerRequest(
  input: RefineCustomerRequestInput,
  ports: RefineCustomerRequestPorts,
): Promise<RefineCustomerRequestResult> {
  if (input.mode === 'replace'
    && (input.replacesPriorStatement !== undefined || input.reportedRouteRef !== undefined)) {
    return { kind: 'refused', reason: 'invalid_amendment' }
  }
  const replay = await ports.replayCommittedCommand({
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    requestId: input.requestRef,
    principalId: input.principalId,
    noEffectReplay: async () => await ports.resumeRequest({
      requestRef: input.requestRef,
      principalId: input.principalId,
    }),
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
  const mode = input.mode ?? 'append'
  if (mode === 'replace' && input.message.trim() === current.aggregate.snapshot.intent.trim()) {
    const expectedRouteGeneration = await ports.loadCurrentRouteGenerationNumber(current)
    if (expectedRouteGeneration === undefined) {
      return projectNeedsAttention({
        requestRef: input.requestRef, revision: input.expectedRevision,
        summary: 'AE could not verify the current options. Try this request again.',
      })
    }
    const recorded = await ports.recordNoopCommand({
      commandKey: input.commandKey,
      commandDigest: input.commandDigest,
      principalId: input.principalId,
      requestId: input.requestRef,
      expectedRevision: input.expectedRevision,
      expectedRouteGeneration,
      aggregateDigest: current.aggregate.aggregateDigest,
      ...(current.routeGenerationRef === undefined ? {} : {
        routeGenerationRef: current.routeGenerationRef,
      }),
      committedAt: Date.now(),
    })
    if (recorded.kind === 'command_conflict') {
      return {
        kind: 'conflict', requestRef: input.requestRef, reason: 'idempotency_key_reused',
      }
    }
    if (recorded.kind !== 'stored' && recorded.kind !== 'replayed') {
      return {
        kind: 'conflict', requestRef: input.requestRef,
        reason: recorded.kind === 'identity_conflict' ? 'identity_changed' : 'revision_changed',
      }
    }
    return await ports.resumeRequest({
      requestRef: input.requestRef,
      principalId: input.principalId,
    })
  }
  const intent = mode === 'replace'
    ? input.message.trim()
    : `${current.aggregate.snapshot.intent.trim()}\n${input.message.trim()}`
  const expectedRouteGeneration = await ports.loadCurrentRouteGenerationNumber(current)
  if (expectedRouteGeneration === undefined) {
    return projectNeedsAttention({
      requestRef: input.requestRef, revision: input.expectedRevision,
      summary: 'AE could not verify the current options. Try this request again.',
    })
  }
  const routeExclusions = mode === 'replace'
    ? []
    : [...(current.aggregate.snapshot.routeExclusions ?? [])]
  if (input.reportedRouteRef !== undefined) {
    const generation = await ports.loadCurrentRouteGeneration(current)
    const route = generation?.routes.find((candidate) => (
      customerRouteRef(generation.generationRef, candidate.routePlanId) === input.reportedRouteRef
    ))
    if (generation === undefined || route === undefined) {
      return { kind: 'refused', reason: 'invalid_amendment' }
    }
    routeExclusions.push({
      choiceSignature: routeChoiceSignature(route),
      reportedRouteRef: input.reportedRouteRef,
      reportedGenerationRef: generation.generationRef,
      reason: input.message.trim(),
      recordedAtRevision: input.expectedRevision + 1,
    })
    const graph = await ports.loadRequestGraph(current.aggregate.snapshot.networkId)
    if (graph.kind !== 'available') return { kind: 'refused', reason: 'capabilities_unavailable' }
    const reboundFacts = rebindStoredFacts(current.aggregate.snapshot.facts as never, graph.models)
    const selections = current.aggregate.plan.actions.flatMap((action) => {
      const model = graph.models.find((candidate) => (
        sameCapabilityContractRef(candidate.contractRef, action.contractRef)
      ))
      if (model === undefined || model.selectionKey !== action.selectionKey
        || model.semanticDigest !== action.semanticDigest) return []
      return [{
        selectionKey: model.selectionKey,
        contractRef: model.contractRef,
        facts: reboundFacts.filter((fact) => fact.selectionKey === model.selectionKey
          && sameCapabilityContractRef(fact.contractRef, model.contractRef)),
      }]
    })
    if (selections.length !== current.aggregate.plan.actions.length) {
      return projectNeedsAttention({
        requestRef: input.requestRef,
        revision: input.expectedRevision,
        summary: 'The registered options changed. Review the Request before continuing.',
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
      priorFacts: reboundFacts,
      routeExclusions,
      proposal: { kind: 'capability_candidates', selections },
      interpreterId: 'customer:reported-option-unavailable',
      graph,
      now: Date.now(),
    })
  }
  return await ports.interpretCompileCommit({
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    requestId: input.requestRef,
    expectedRevision: input.expectedRevision,
    expectedRouteGeneration,
    principalId: input.principalId,
    delegatedAgentId: current.aggregate.snapshot.delegatedAgentId,
    intent,
    ...(mode === 'append' ? {
      amendment: {
        priorCustomerJob: current.aggregate.snapshot.intent,
        message: input.message.trim(),
        ...(input.replacesPriorStatement === undefined ? {} : {
          replacesPriorStatement: input.replacesPriorStatement.trim(),
        }),
      },
    } : {}),
    networkId: current.aggregate.snapshot.networkId,
    priorFacts: current.aggregate.snapshot.facts as never,
    routeExclusions,
    replaceCustomerRequestLiteral: true,
    now: Date.now(),
  })
}
