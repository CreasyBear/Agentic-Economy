import { listActions } from '@/modules/actions'
import { readCompletedResultIdentity } from '@/modules/action-invocation'
import {
  evaluateAdr009Transfer,
  type TransferBoundaryEvent,
} from '@/modules/action-invocation/transfer-evaluator'
import { resolveActionContract } from '@/modules/common/action'
import {
  attachCompletedTaskReference,
  projectReferenceComposition,
} from '@/modules/customer-request/application/public'
import { compileCustomerRequest } from '@/modules/customer-request/compiler'
import {
  actionToHarnessToolContract,
  createHarnessToolBoundaryInstrumentation,
} from '@/modules/harness/tool-contract'
import { registryDetailAction } from '@/modules/registry/registry.actions'
import {
  developmentEvidenceActor as actor,
  developmentEvidenceNowMs as nowMs,
  type createDevelopmentEvidenceQuoteInput,
  type createDevelopmentEvidenceSupplyPorts,
} from './development-evidence-fixture'
import type { DevelopmentInvocationEvidence } from './development-evidence-invocations'
import {
  collectSuppliedCandidateQuoteAction,
  type SuppliedCandidateQuoteInput,
} from './server'

type Graph = ReturnType<typeof createDevelopmentEvidenceSupplyPorts>
type Input = Awaited<ReturnType<typeof createDevelopmentEvidenceQuoteInput>>

export async function buildDevelopmentContinuityEvidence(
  graph: Graph,
  input: Input,
  invocations: DevelopmentInvocationEvidence,
) {
  const directRead = await executeDirectRead()
  const directConsequential = await executeDirectConsequential(graph, input)
  const effectsBeforeReuse = invocations.standalone.effectCalls
  const compiled = compileCustomerRequest({
    requestId: 'mock:request:reuse', expectedRevision: 0,
    principalId: actor.principalRef, delegatedAgentId: actor.callerRef,
    intent: 'MOCK/DEVELOPMENT ONLY: continue from the completed quote.',
    networkId: 'mock:network',
    proposal: { kind: 'unsupported_request', reason: 'requested_result_not_available' },
    interpreterId: 'mock:interpreter', bindings: [], models: [], now: nowMs,
  })
  if (compiled.kind !== 'compiled') throw new Error('mock_request_compile_failed')
  const attached = attachCompletedTaskReference({
    principalRef: actor.principalRef, callerRef: actor.callerRef,
    invocationRef: invocations.views[1]!.invocationRef, referencedAt: nowMs + 1,
    candidateAggregate: compiled.aggregate,
  }, {
    readCompletedResultIdentity: ({ invocationRef, actor: identity }) =>
      readCompletedResultIdentity(
        invocations.standalone.port,
        invocationRef,
        identity,
        () => ({
          sourceResultRef: invocations.standalone.sourceResultRef,
          result: invocations.standalone.result,
        }),
      ),
  })
  if (attached.kind === 'refused') throw new Error(attached.reason)
  const actionVersion = resolveActionContract(collectSuppliedCandidateQuoteAction).version
  const nodes = [{
    nodeRef: 'mock:node:completed-quote',
    actionId: collectSuppliedCandidateQuoteAction.id,
    actionVersion,
    dependencies: [],
    completionCondition: 'required' as const,
    inspection: {
      kind: 'completed_task' as const,
      referenceRef: attached.reference.referenceRef,
      invocationRef: attached.reference.invocationRef,
      sourceResultRef: attached.reference.sourceResultRef,
    },
  }]
  const composition = projectReferenceComposition({
    requestRef: attached.aggregate.snapshot.requestId,
    revision: attached.aggregate.snapshot.revision,
    aggregate: attached.aggregate,
    nodes,
  }, {
    resolveRegisteredAction: registeredDescriptor,
    resolveCompletedResult: (ref) =>
      ref === attached.reference.referenceRef ? attached.reference : undefined,
    resolveInvocation: () => undefined,
  })
  if (composition.kind !== 'projected') throw new Error(composition.reason)
  const serializedReferences = JSON.stringify({
    references: attached.aggregate.completedTaskReferences,
    projection: composition.projection,
  })
  const copiedLifecycleOrResultFields = serializedReferences.match(
    /authority|attempt|control|quoteRef|price|terms|evidenceRefs/u,
  )?.length ?? 0
  const controlledEvents = deriveControlledEvents(invocations)
  const standaloneView = invocations.views[1]!
  const history = invocations.standalone.state.history.get(standaloneView.invocationRef) ?? []
  const transfer = evaluateAdr009Transfer({
    events: {
      direct_read: directRead.events,
      direct_consequential: directConsequential.events,
      controlled: controlledEvents,
    },
    requiredContinuations: {
      direct_read: resolveActionContract(registryDetailAction).safeContinuations.length,
      direct_consequential:
        resolveActionContract(collectSuppliedCandidateQuoteAction).safeContinuations.length,
      controlled:
        resolveActionContract(collectSuppliedCandidateQuoteAction).safeContinuations.length,
    },
    controlledReadback: {
      invocationVersion: standaloneView.invocationVersion,
      controlRecords: invocations.standalone.state.controls.size,
      attributableAttempts:
        invocations.standalone.state.attempts.get(standaloneView.invocationRef)?.size ?? 0,
      durableHistoryRecords: history.length,
      terminalResultReconstructed:
        standaloneView.observedResolution.state === 'returned'
        && standaloneView.observedResolution.businessOutcome === 'completed',
      exactAuthorityBeforeRelease:
        history.findIndex(({ kind }) => kind === 'decide')
        < history.findIndex(({ kind }) => kind === 'begin_release'),
      retryClass: resolveActionContract(collectSuppliedCandidateQuoteAction).retryClass,
    },
    referenceReuse: {
      completedReferences: attached.aggregate.completedTaskReferences?.length ?? 0,
      completedNodes: composition.projection.nodes.filter(({ state }) => state === 'completed').length,
      currentNodes: composition.projection.nodes.filter(({ state }) => state === 'current').length,
      effectsBeforeReuse,
      effectsAfterReuse: invocations.standalone.effectCalls,
      copiedLifecycleOrResultFields,
      persistedRoutePlansOrBundles: attached.aggregate.plan.actions.length,
    },
  })
  return {
    completedReference: attached.reference,
    requestAggregate: attached.aggregate,
    compositionNodes: nodes,
    composition: composition.projection,
    directControl: {
      action: registryDetailAction.id,
      result: directRead.result,
      events: directRead.events,
      lifecycleEmissions: directRead.snapshot,
    },
    directConsequential: {
      action: collectSuppliedCandidateQuoteAction.id,
      result: directConsequential.result,
      events: directConsequential.events,
      effectCalls: directConsequential.effectCalls,
    },
    transfer,
  }
}

async function executeDirectRead() {
  const events: TransferBoundaryEvent[] = []
  const instrumentation = createHarnessToolBoundaryInstrumentation((event) => events.push(event))
  const result = await actionToHarnessToolContract(registryDetailAction, instrumentation).execute({
    input: { slug: 'mock-development-provider' },
    context: {
      developmentOnlyRegistryDetailAdapter: async ({ slug }) => ({
        kind: 'not_found',
        code: 'business_not_found',
        reason: `MOCK/DEVELOPMENT ONLY: no public listing for ${slug}.`,
      }),
    },
  })
  return { result, events, snapshot: instrumentation.snapshot() }
}

async function executeDirectConsequential(graph: Graph, input: SuppliedCandidateQuoteInput) {
  const events: TransferBoundaryEvent[] = []
  let effectCalls = 0
  const instrumentation = createHarnessToolBoundaryInstrumentation((event) => events.push(event))
  const result = await actionToHarnessToolContract(
    collectSuppliedCandidateQuoteAction,
    instrumentation,
  ).execute({
    input,
    context: {
      developmentOnlySuppliedQuoteQualificationPorts: graph,
      developmentOnlySuppliedQuoteNow: () => nowMs,
      developmentOnlySuppliedQuoteAdapter: async () => {
        effectCalls += 1
        events.push({ kind: 'effect_call', actionId: collectSuppliedCandidateQuoteAction.id })
        return {
          kind: 'quote_returned',
          environment: 'MOCK/DEVELOPMENT ONLY',
          quote: {
            quoteRef: 'mock:quote:direct-consequential',
            price: { amountMinor: 24_500, currency: 'AUD' },
            validUntil: nowMs + 3_600_000,
            terms: ['Fixture only; no provider commitment or fulfilment.'],
            evidenceRefs: ['mock:evidence:direct-consequential'],
          },
        }
      },
    },
  })
  return { result, events, effectCalls }
}

function deriveControlledEvents(
  invocations: DevelopmentInvocationEvidence,
): TransferBoundaryEvent[] {
  const ref = invocations.views[1]!.invocationRef
  const history = invocations.standalone.state.history.get(ref) ?? []
  const authorityIndex = history.findIndex(({ kind }) => kind === 'decide')
  const releaseIndex = history.findIndex(({ kind }) => kind === 'begin_release')
  if (authorityIndex < 0 || releaseIndex < 0 || authorityIndex >= releaseIndex) {
    throw new Error('controlled_event_order_invalid')
  }
  const events: TransferBoundaryEvent[] = [
    { kind: 'approval_policy', policy: 'prompt', reason: 'exact invocation authority' },
    { kind: 'authority_decision', invocationRef: ref },
    { kind: 'user_or_supervisor_decision', invocationRef: ref },
    ...invocations.standalone.events,
  ]
  for (const row of invocations.standalone.state.controls.values()) {
    events.push({ kind: 'control', invocationRef: row.invocationRef })
  }
  for (const row of invocations.standalone.state.attempts.get(ref)?.values() ?? []) {
    events.push({ kind: 'attempt', invocationRef: row.invocationRef, attemptRef: row.attemptRef })
  }
  for (const row of history) {
    events.push({ kind: 'history', invocationRef: row.invocationRef, commandId: row.commandId })
  }
  return events
}

export function registeredDescriptor(id: string) {
  const action = listActions().find(({ id: candidateId }) => candidateId === id)
  if (action === undefined) return undefined
  const resolved = resolveActionContract(action)
  return {
    actionId: action.id, actionVersion: resolved.version, name: action.name,
    summary: action.summary, boundaries: action.boundaries,
    safeContinuations: resolved.safeContinuations,
  }
}
