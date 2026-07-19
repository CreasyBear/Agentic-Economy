import { resolveActionContract } from '@/modules/common/action'
import {
  buildDevelopmentContinuityEvidence,
} from './development-evidence-continuity'
import {
  createDevelopmentEvidenceQuoteInput,
  createDevelopmentEvidenceSupplyPorts,
  developmentEvidenceActor,
  developmentEvidenceCandidate,
} from './development-evidence-fixture'
import { runDevelopmentInvocations } from './development-evidence-invocations'
import { collectSuppliedCandidateQuoteAction } from './server'

export async function runDevelopmentEvidenceScenario() {
  const graph = createDevelopmentEvidenceSupplyPorts()
  const input = await createDevelopmentEvidenceQuoteInput(graph)
  const invocations = await runDevelopmentInvocations(graph, input)
  const continuity = await buildDevelopmentContinuityEvidence(graph, input, invocations)
  const actionVersion = resolveActionContract(collectSuppliedCandidateQuoteAction).version
  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    action: { id: collectSuppliedCandidateQuoteAction.id, version: actionVersion },
    cohort: {
      caller: 'mock developer caller',
      provider: 'mock deterministic provider',
      supply: 'fixture',
    },
    mockData: {
      actor: developmentEvidenceActor,
      candidate: developmentEvidenceCandidate,
      quote: invocations.standalone.result,
    },
    origins: invocations.views.map((view) => ({
      origin: view.origin,
      invocationRef: view.invocationRef,
    })),
    observedTransitions: invocations.views.map((view) => ({
      invocationRef: view.invocationRef,
      version: view.invocationVersion,
      control: view.control,
      attempts: view.attempts,
      resolution: view.observedResolution,
    })),
    recovery: invocations.recovery,
    directControl: continuity.directControl,
    directConsequential: continuity.directConsequential,
    durable: {
      controls: [...invocations.standalone.state.controls.values()],
      attempts: [
        ...(invocations.standalone.state.attempts
          .get(invocations.views[1]!.invocationRef)?.values() ?? []),
      ],
      history: invocations.standalone.state.history.get(invocations.views[1]!.invocationRef) ?? [],
      source: {
        input: invocations.standalone.sourceInput,
        prepared: invocations.standalone.sourcePrepared,
        sourceResultRef: invocations.standalone.sourceResultRef,
        result: invocations.standalone.result,
      },
    },
    completedReference: continuity.completedReference,
    requestAggregate: continuity.requestAggregate,
    compositionNodes: continuity.compositionNodes,
    composition: continuity.composition,
    transfer: continuity.transfer,
    commandResults: {
      requestOwned: invocations.views[0]!.observedResolution,
      standalone: invocations.views[1]!.observedResolution,
      recovery: invocations.recovery.after,
    },
    claimCeiling:
      'Labelled local development evidence only. No hosted behavior, real provider/cohort, fulfilment, production safety, or customer value.',
  }
}
