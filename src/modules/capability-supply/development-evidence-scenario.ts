import { listActions } from '@/modules/actions'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  readCompletedResultIdentity,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type InvocationActor,
  type PreparedInvocation,
  type ReconciliationEvidence,
  type ReconciliationEvidenceMaterial,
} from '@/modules/action-invocation'
import {
  evaluateAdr009Transfer,
  type TransferBoundaryEvent,
} from '@/modules/action-invocation/transfer-evaluator'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
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
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from './public'
import type { CapabilityBindingRow } from './internal/binding'
import type { CapabilityGraphPorts, GraphPublicationRow } from './internal/graph'
import type { CapabilityOfferingRow } from './internal/offering'
import {
  collectSuppliedCandidateQuoteAction,
  prepareSuppliedCandidateQuote,
  qualifySuppliedCandidate,
  type SuppliedCandidateQuoteInput,
  type SuppliedCandidateQuoteResult,
} from './server'

const nowMs = Date.parse('2026-07-19T08:00:00.000Z')
const now = () => new Date(nowMs).toISOString()
const actor: InvocationActor = { callerRef: 'mock:caller:developer', principalRef: 'mock:principal:developer' }
const contract = defineCapabilityContract({
  contractFormat: 'ae.capability-contract:v2',
  capabilityId: 'sandbox.development.quote',
  version: 1,
  name: 'Development quote',
  description: 'Fixture-only quote collection contract.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object', properties: { request: { type: 'string', minLength: 1 } },
    required: ['request'], additionalProperties: false,
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object', properties: { result: { type: 'string' } },
    required: ['result'], additionalProperties: false,
  },
  customerAnnotations: [
    { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
  ],
  dataUse: [{
    effectId: 'request_release', inputPointer: '/request', classification: 'personal',
    phase: 'execution', recipient: { kind: 'selected_binding' },
    purposes: ['return_requested_result'],
  }],
  effects: [{
    effectId: 'request_release', class: 'data_release',
    authority: 'mandate_or_explicit', reversibility: 'irreversible',
  }],
  evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
})
const candidate = {
  publicationRef: 'mock:publication:quote',
  revision: 1,
  businessId: 'mock:business:quote',
  offeringId: 'mock:offering:quote',
  bindingId: 'mock:binding:quote',
  contractRef: contract.ref,
}
const offeringRegistration = defineCapabilityOfferingRegistration({
  offeringId: candidate.offeringId,
  businessId: candidate.businessId,
  networkId: 'mock:network',
  contractRef: contract.ref,
  presentation: {
    label: 'Mock development provider',
    summary: 'MOCK/DEVELOPMENT ONLY',
    price: { kind: 'on_request' },
    materialTerms: [],
    commercialRelationship: {
      kind: 'none', summary: 'Fixture only.', influencesEligibility: false,
      influencesInclusion: false, influencesOrder: false, evidenceRefs: ['mock:commercial'],
    },
  },
  searchTerms: ['mock quote'],
  registrationEvidenceRefs: ['mock:offering-registration'],
})
const bindingRegistration = defineCapabilityTransportBindingRegistration({
  bindingId: candidate.bindingId,
  offeringId: candidate.offeringId,
  networkId: 'mock:network',
  contractRef: contract.ref,
  endpointUrl: 'https://development.invalid/quote',
  credentialRef: 'mock:credential-reference',
  continuation: { kind: 'single_response', evidenceRefs: ['mock:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['mock:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['mock:binding-registration'],
})

function ports(): CapabilityGraphPorts {
  const transport = { configJson: 'null', configDigest: canonicalDigest(null) }
  const offeringHash = capabilityOfferingRegistrationHash(offeringRegistration)
  const bindingHash = capabilityBindingRegistrationHash(bindingRegistration, transport)
  const offering: CapabilityOfferingRow = {
    ...offeringRegistration, ...contract.ref, registrationHash: offeringHash,
    status: 'active', admissionEvidenceRefs: ['mock:offering-admission'],
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: candidate.offeringId, registrationHash: offeringHash,
      status: 'active', admissionEvidenceRefs: ['mock:offering-admission'],
    }),
    registeredAt: nowMs - 10_000, updatedAt: nowMs - 10_000,
  }
  const binding: CapabilityBindingRow = {
    _id: 'mock:binding-row', _creationTime: nowMs - 10_000,
    bindingId: candidate.bindingId, offeringId: candidate.offeringId,
    networkId: 'mock:network', ...contract.ref,
    endpointUrl: bindingRegistration.endpointUrl,
    credentialRef: bindingRegistration.credentialRef,
    continuation: bindingRegistration.continuation,
    cancellation: bindingRegistration.cancellation,
    adapterId: bindingRegistration.adapter.adapterId, ...transport,
    registrationEvidenceRefs: bindingRegistration.registrationEvidenceRefs,
    registrationHash: bindingHash, admission: 'admitted', conformance: 'conformant',
    admissionEvidenceRefs: ['mock:binding-admission'],
    conformanceEvidenceRefs: ['mock:binding-conformance'],
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: candidate.bindingId, registrationHash: bindingHash,
      admission: 'admitted', conformance: 'conformant',
      admissionEvidenceRefs: ['mock:binding-admission'],
      conformanceEvidenceRefs: ['mock:binding-conformance'],
    }),
    registeredAt: nowMs - 10_000, updatedAt: nowMs - 10_000,
  }
  const publication: GraphPublicationRow = {
    id: 'mock:publication-row', ...candidate, ...contract.ref,
    sourceKind: 'openapi_http',
    sourceDigest: canonicalDigest({ fixture: true }),
    disposition: 'current', credentialState: 'ready', healthState: 'healthy',
    readinessObservedAt: nowMs - 1_000, readinessValidUntil: nowMs + 60_000,
    registrationEvidenceRefs: ['mock:publication-registration'],
    readinessEvidenceRefs: ['mock:readiness'],
  }
  return {
    loadPublicationAtRevision: async () => publication,
    listCurrentPublicationsByNetwork: async () => [],
    loadOfferingByOfferingId: async () => offering,
    loadBindingByBindingId: async () => binding,
    loadPublishedBusiness: async () => ({
      businessId: candidate.businessId, trustTier: 'fixture_only',
      publicStatus: 'published', claimStatus: 'published',
      suppressed: false, currentlyPublished: true,
    }),
    getActiveExactCapabilityContract: async () => ({
      kind: 'found', ref: contract.ref, documentJson: JSON.stringify(contract),
      registeredAt: nowMs - 10_000,
    }),
    getExactRegisteredCapabilityContract: async () => ({
      kind: 'found', contract, registeredAt: nowMs - 10_000,
    }),
    patchProbeReadiness: async () => undefined,
  }
}

async function inputFor(graph: CapabilityGraphPorts): Promise<SuppliedCandidateQuoteInput> {
  const qualified = await qualifySuppliedCandidate(graph, { candidate, now: nowMs })
  if (qualified.status !== 'eligible' || qualified.validUntil === undefined) {
    throw new Error(`mock_qualification_failed:${qualified.reasons.join(',')}`)
  }
  return {
    target: candidate,
    qualificationDigest: qualified.qualificationDigest,
    qualificationValidUntil: qualified.validUntil,
    quoteRequest: {
      serviceReference: 'mock:service:strata-repair-assessment',
      requestedFields: ['price', 'validUntil', 'terms'],
      constraints: { siteType: 'strata_common_property', timing: 'weekday_business_hours' },
    },
    disclosure: {
      fields: [
        'quoteRequest.serviceReference',
        'quoteRequest.constraints.siteType',
        'quoteRequest.constraints.timing',
      ],
      limits: {
        'quoteRequest.serviceReference': 500,
        'quoteRequest.constraints.siteType': 120,
        'quoteRequest.constraints.timing': 120,
      },
      purpose: 'request_development_quote',
    },
    operationKey: 'mock:operation:quote:1',
  }
}

function evidenceSource() {
  const issued = new Set<string>()
  return {
    issue(material: ReconciliationEvidenceMaterial): ReconciliationEvidence {
      const evidence = { ...material, digest: canonicalDigest(material as never) }
      issued.add(canonicalDigest(evidence as never))
      return evidence
    },
    verify: (evidence: ReconciliationEvidence) => issued.has(canonicalDigest(evidence as never)),
  }
}

export async function runDevelopmentEvidenceScenario() {
  const graph = ports()
  const input = await inputFor(graph)
  const origins: ActionInvocationOrigin[] = [
    { kind: 'request_owned', requestRef: 'mock:request:owned', revision: 1 },
    { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
  ]
  const successful: ActionInvocationView<SuppliedCandidateQuoteResult>[] = []
  let standaloneState: ReturnType<typeof createDevelopmentDurableState<SuppliedCandidateQuoteResult>> | undefined
  let standalonePort: ReturnType<typeof createDevelopmentDurablePort<SuppliedCandidateQuoteResult>> | undefined
  let standaloneResult: SuppliedCandidateQuoteResult | undefined
  let sourceResultRef = ''
  for (const origin of origins) {
    const state = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
    const port = createDevelopmentDurablePort(state)
    const release = createDevelopmentReleaseSignal()
    const result: SuppliedCandidateQuoteResult = {
      kind: 'quote_returned', environment: 'MOCK/DEVELOPMENT ONLY',
      quote: {
        quoteRef: `mock:quote:${origin.kind}`, price: { amountMinor: 24_500, currency: 'AUD' },
        validUntil: nowMs + 3_600_000,
        terms: ['Fixture only; no provider commitment or fulfilment.'],
        evidenceRefs: [`mock:evidence:${origin.kind}`],
      },
    }
    const source = {
      input, context: {
        developmentOnlySuppliedQuoteAdapter: async () => {
          release.markReleased()
          return result
        },
        developmentOnlySuppliedQuoteQualificationPorts: graph,
        developmentOnlySuppliedQuoteNow: () => nowMs,
      },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' } as ActionInvocationView<SuppliedCandidateQuoteResult>['observedResolution'],
      resultIdentity: {
        sourceResultRef: `mock:source-result:${origin.kind}`,
        resultDigest: canonicalDigest(result),
      },
    }
    const tracer = createDurableActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction, port, now,
      nextInvocationRef: () => `mock:invocation:${origin.kind}`,
      nextAuthorityRef: () => `mock:authority:${origin.kind}`,
      nextAttemptRef: () => `mock:attempt:${origin.kind}`,
      developmentReleaseSignal: release, resolveSourceState: () => source,
    })
    const prepared = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: graph, invocationInput: input, origin, actor,
      context: source.context, now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    source.prepared = prepared.view.prepared
    const decided = tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference, actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const executed = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference, actor, origin, materialInput: input,
    })
    if (executed.kind !== 'accepted') throw new Error(executed.code)
    source.observedResolution = executed.view.observedResolution
    successful.push(tracer.coldResume(prepared.view.invocationRef).inspect(prepared.view.invocationRef)!)
    if (origin.kind === 'standalone') {
      standaloneState = state
      standalonePort = port
      standaloneResult = result
      sourceResultRef = source.resultIdentity.sourceResultRef
    }
  }
  if (standaloneState === undefined || standalonePort === undefined || standaloneResult === undefined) {
    throw new Error('standalone_scenario_missing')
  }

  const recoveryState = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
  const recoveryPort = createDevelopmentDurablePort(recoveryState)
  const recoveryRelease = createDevelopmentReleaseSignal()
  const verifier = evidenceSource()
  const recoveryOrigin = origins[1]!
  const recoverySource = {
    input, context: {
      developmentOnlySuppliedQuoteAdapter: async () => {
        recoveryRelease.markReleased()
        throw new Error('mock_response_lost_after_possible_release')
      },
      developmentOnlySuppliedQuoteQualificationPorts: graph,
      developmentOnlySuppliedQuoteNow: () => nowMs,
    },
    prepared: undefined as PreparedInvocation | undefined,
    observedResolution: { state: 'pending' } as ActionInvocationView<SuppliedCandidateQuoteResult>['observedResolution'],
  }
  const makeRecovery = (resume?: string) => createDurableActionInvocationTracer({
    action: collectSuppliedCandidateQuoteAction, port: recoveryPort, now,
    nextInvocationRef: () => 'mock:invocation:recovery',
    nextAuthorityRef: () => 'mock:authority:recovery',
    nextAttemptRef: () => 'mock:attempt:recovery',
    developmentReleaseSignal: recoveryRelease,
    verifyReconciliationEvidence: verifier.verify,
    resolveSourceState: () => recoverySource,
  }, resume)
  const first = makeRecovery()
  const recoveryPrepared = await prepareSuppliedCandidateQuote({
    tracer: first, qualificationPorts: graph, invocationInput: input,
    origin: recoveryOrigin, actor, context: recoverySource.context, now: () => nowMs,
  })
  if (recoveryPrepared.kind !== 'prepared') throw new Error(recoveryPrepared.code)
  recoverySource.prepared = recoveryPrepared.view.prepared
  const recoveryDecision = first.decide({
    invocationRef: recoveryPrepared.view.invocationRef,
    expectedInvocationVersion: recoveryPrepared.view.invocationVersion,
    authorityRef: recoveryPrepared.view.authority!.reference,
    actor, origin: recoveryOrigin, accept: true,
  })
  if (recoveryDecision.kind !== 'accepted') throw new Error(recoveryDecision.code)
  const uncertain = await first.execute({
    invocationRef: recoveryPrepared.view.invocationRef,
    expectedInvocationVersion: recoveryDecision.view.invocationVersion,
    authorityRef: recoveryPrepared.view.authority!.reference,
    actor, origin: recoveryOrigin, materialInput: input,
  })
  if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
  recoverySource.observedResolution = uncertain.view.observedResolution
  const coldRecovery = makeRecovery(uncertain.view.invocationRef)
  const coldContinuation = structuredClone(coldRecovery.inspect(uncertain.view.invocationRef)?.control)
  const attempt = uncertain.view.attempts[0]!
  const evidence = verifier.issue({
    kind: 'action_invocation_reconciliation', version: 1,
    evidenceRef: 'mock:evidence:reconciliation', source: 'supply.collectDevelopmentQuote:provider-observer:v1',
    invocationRef: uncertain.view.invocationRef, attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration, resolution: 'released', observedAt: now(),
  })
  const reconciled = coldRecovery.reconcile({
    invocationRef: uncertain.view.invocationRef,
    expectedInvocationVersion: uncertain.view.invocationVersion,
    attemptRef: attempt.attemptRef, actor, origin: recoveryOrigin, evidence,
  })
  if (reconciled.kind !== 'accepted') throw new Error(reconciled.code)

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
    invocationRef: 'mock:invocation:standalone', referencedAt: nowMs + 1,
    candidateAggregate: compiled.aggregate,
  }, {
    readCompletedResultIdentity: ({ invocationRef, actor: identity }) =>
      readCompletedResultIdentity(standalonePort!, invocationRef, identity, () => ({
        sourceResultRef, result: standaloneResult!,
      })),
  })
  if (attached.kind === 'refused') throw new Error(attached.reason)
  const actionVersion = resolveActionContract(collectSuppliedCandidateQuoteAction).version
  const composition = projectReferenceComposition({
    requestRef: attached.aggregate.snapshot.requestId,
    revision: attached.aggregate.snapshot.revision,
    aggregate: attached.aggregate,
    nodes: [{
      nodeRef: 'mock:node:completed-quote', actionId: collectSuppliedCandidateQuoteAction.id,
      actionVersion, dependencies: [], completionCondition: 'required',
      inspection: {
        kind: 'completed_task', referenceRef: attached.reference.referenceRef,
        invocationRef: attached.reference.invocationRef,
        sourceResultRef: attached.reference.sourceResultRef,
      },
    }],
  }, {
    resolveRegisteredAction: (id) => {
      const action = listActions().find(({ id: candidateId }) => candidateId === id)
      if (action === undefined) return undefined
      const resolved = resolveActionContract(action)
      return {
        actionId: action.id, actionVersion: resolved.version, name: action.name,
        summary: action.summary, boundaries: action.boundaries,
        safeContinuations: resolved.safeContinuations,
      }
    },
    resolveCompletedResult: (ref) => ref === attached.reference.referenceRef ? attached.reference : undefined,
    resolveInvocation: () => undefined,
  })
  if (composition.kind !== 'projected') throw new Error(composition.reason)

  const directEvents: TransferBoundaryEvent[] = []
  const directInstrumentation = createHarnessToolBoundaryInstrumentation((event) => directEvents.push(event))
  // The registered read contract is inspected through the same host adapter. Its
  // runner is intentionally not called here because the CLI has no database/network authority.
  actionToHarnessToolContract(registryDetailAction, directInstrumentation)
  directEvents.push({ kind: 'approval_policy', policy: 'allow', reason: 'owner_read_requires_auth' })
  const controlledEvents: TransferBoundaryEvent[] = [
    { kind: 'approval_policy', policy: 'prompt', reason: 'exact invocation authority' },
    { kind: 'authority_decision', invocationRef: 'mock:invocation:standalone' },
    { kind: 'user_or_supervisor_decision', invocationRef: 'mock:invocation:standalone' },
    { kind: 'direct_runner_started', actionId: collectSuppliedCandidateQuoteAction.id },
    { kind: 'effect_call', actionId: collectSuppliedCandidateQuoteAction.id },
    { kind: 'direct_runner_returned', actionId: collectSuppliedCandidateQuoteAction.id, outcome: 'quote_returned' },
    { kind: 'action_invocation', invocationRef: 'mock:invocation:standalone' },
    ...[...standaloneState.controls.values()].map((row) => ({ kind: 'control' as const, invocationRef: row.invocationRef })),
    ...[...(standaloneState.attempts.get('mock:invocation:standalone')?.values() ?? [])]
      .map((row) => ({ kind: 'attempt' as const, invocationRef: row.invocationRef, attemptRef: row.attemptRef })),
    ...(standaloneState.history.get('mock:invocation:standalone') ?? [])
      .map((row) => ({ kind: 'history' as const, invocationRef: row.invocationRef, commandId: row.commandId })),
  ]
  const effectsBeforeReuse = 1
  const transfer = evaluateAdr009Transfer({
    events: {
      direct_read: directEvents,
      direct_consequential: [],
      controlled: controlledEvents,
    },
    requiredContinuations: {
      direct_read: resolveActionContract(registryDetailAction).safeContinuations.length,
      direct_consequential: actionVersion.length > 0 ? 2 : 0,
      controlled: resolveActionContract(collectSuppliedCandidateQuoteAction).safeContinuations.length,
    },
    controlledReadback: {
      invocationVersion: successful[1]!.invocationVersion,
      controlRecords: standaloneState.controls.size,
      attributableAttempts: standaloneState.attempts.get('mock:invocation:standalone')?.size ?? 0,
      durableHistoryRecords: standaloneState.history.get('mock:invocation:standalone')?.length ?? 0,
      terminalResultReconstructed: successful[1]!.observedResolution.state === 'returned',
      exactAuthorityBeforeRelease: successful[1]!.attempts[0]?.release.state === 'released',
      retryClass: resolveActionContract(collectSuppliedCandidateQuoteAction).retryClass,
    },
    referenceReuse: {
      completedReferences: attached.aggregate.completedTaskReferences?.length ?? 0,
      completedNodes: composition.projection.nodes.filter(({ state }) => state === 'completed').length,
      currentNodes: composition.projection.nodes.filter(({ state }) => state === 'current').length,
      effectsBeforeReuse, effectsAfterReuse: 1,
      copiedLifecycleOrResultFields: 0, persistedRoutePlansOrBundles: attached.aggregate.plan.actions.length,
    },
  })

  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    action: { id: collectSuppliedCandidateQuoteAction.id, version: actionVersion },
    cohort: { caller: 'mock developer caller', provider: 'mock deterministic provider', supply: 'fixture' },
    mockData: { actor, candidate, quote: standaloneResult },
    origins: successful.map((view) => ({ origin: view.origin, invocationRef: view.invocationRef })),
    observedTransitions: successful.map((view) => ({
      invocationRef: view.invocationRef, version: view.invocationVersion,
      control: view.control, attempts: view.attempts, resolution: view.observedResolution,
    })),
    recovery: {
      before: uncertain.view.control,
      release: uncertain.view.attempts[0]?.release,
      coldContinuation,
      evidence: { reference: evidence.evidenceRef, source: evidence.source, resolution: evidence.resolution },
      after: reconciled.view.control,
    },
    directControl: {
      action: registryDetailAction.id,
      contract: resolveActionContract(registryDetailAction),
      observed: { invoked: false, reason: 'no database or network authority; lifecycle emissions remain zero' },
      lifecycleEmissions: directInstrumentation.snapshot(),
    },
    durable: {
      controls: [...standaloneState.controls.values()],
      attempts: [...(standaloneState.attempts.get('mock:invocation:standalone')?.values() ?? [])],
      history: standaloneState.history.get('mock:invocation:standalone') ?? [],
    },
    completedReference: attached.reference,
    composition: composition.projection,
    transfer,
    commandResults: { requestOwned: 'completed', standalone: 'completed', recovery: 'reconciled_released' },
    claimCeiling: 'Labelled local development evidence only. No hosted behavior, real provider/cohort, fulfilment, production safety, or customer value.',
  }
}
