import type { StableHashValue } from '@/modules/common/stable-hash'
import { canonicalAuthorityDigest } from './authority-digest'

import type {
  CandidateGraphQuote,
  CandidateGraphStepQuote,
  CapabilityBindingAdapter,
  KernelCaller,
  KernelIdFactory,
  RouteAuthorization,
  RouteQuote,
  RootRunSnapshot,
} from './model'
import { compileRoutingSnapshot, type BindingRoutingEvidenceSnapshot, type RoutingPriority } from './routing-compiler'
import { createAllowingIncidentEvaluator, type IncidentEvaluator } from '../incident-control'
import {
  createStructuredQuotePreparationOperation,
  type StructuredPreparationInput,
  type StructuredPreparationResult,
} from '../structured-quote-preparation'
import {
  createInMemoryStructuredQuotePreparationStore,
  type StructuredQuotePreparationStore,
} from '../structured-quote-preparation-store'
import { createInMemoryKernelStore, type KernelStore, type ProviderCancellation } from './store'
import { createExecuteOperation, createExecutionRequestDigest } from './execute'
import { createReconcileOperations } from './reconcile'
import { record } from './shared/run-snapshots'
import {
  bindingScope,
  callerScope,
  graphScope,
  runIncidentScope,
  sameCaller,
} from './shared/incident-scope'

export { createExecutionRequestDigest }

export type CreateNeutralRoutingKernelInput = Readonly<{
  now: () => number
  executionMode: 'simulation' | 'live'
  ids: KernelIdFactory
  quoteTtlMs: number
  bindings: readonly CapabilityBindingAdapter[]
  routingEvidenceSnapshots?: readonly BindingRoutingEvidenceSnapshot[]
  store?: KernelStore
  incidentControl?: IncidentEvaluator
  structuredPreparationStore?: StructuredQuotePreparationStore
  resolveCurrentStructuredBinding?: Parameters<typeof createStructuredQuotePreparationOperation>[0]['resolveCurrentBinding']
  lifecycle?: Readonly<{
    afterRootAdmission?: (checkpoint: Readonly<{ rootRunId: string; leafRunId: string; bindingId: string }>) => Promise<void>
    afterProviderOutcome?: (checkpoint: Readonly<{ rootRunId: string; leafRunId: string; bindingId: string }>) => Promise<void>
  }>
}>

export type RouteInput = Readonly<{
  routingRequestId?: string
  networkId: string
  caller: KernelCaller
  query: string
  constraints: Readonly<{
    currency: string
    maximumSpendMinor: number
    optimizeFor?: RoutingPriority
  }>
}>

export type RouteResult =
  | Readonly<{ kind: 'quoted'; quote: RouteQuote }>
  | Readonly<{ kind: 'no_route'; reason: string }>

export type AuthorizeInput = Readonly<{
  authorizationRef?: string
  budgetAuthorityRef?: string
  budgetMaximumGrossMinor?: number
  dataAuthorizationBudgetRef?: string
  protectedFieldSetId?: string
  dataBudgetMaximumAttempts?: number
  dataBudgetMaximumExposures?: number
  allowedRecipientBindingIds?: readonly string[]
  allowedDisclosurePurposes?: readonly string[]
  maximumDisclosureAttempts?: number
  maximumDisclosureExposures?: number
  quoteId: string
  quoteDigest: string
  principalId: string
  agentId: string
  maximumSpendMinor: number
  currency: string
  expiresAt: number
  allowedDataFields?: readonly string[]
  incidentEpochDigest?: string
}>

export type ExecuteInput = Readonly<{
  caller: KernelCaller
  quoteId: string
  quoteDigest: string
  authorizationRef: string
  idempotencyKey: string
  data?: Readonly<Record<string, string>>
  executionPurpose?: 'incident_canary'
  canaryRecoveryGrantId?: string
}>

export type ExecuteResult =
  | Readonly<{ kind: 'run_admitted'; run: RootRunSnapshot }>
  | Readonly<{ kind: 'execution_pending'; rootRunId: string }>
  | Readonly<{ kind: 'execution_refused'; reason: string }>

export type InspectInput = Readonly<{
  caller: KernelCaller
  rootRunId: string
}>

export type InspectResult =
  | Readonly<{ kind: 'run_found'; run: RootRunSnapshot }>
  | Readonly<{ kind: 'run_not_found' }>

export type CancelInput = InspectInput

export type ReconcileProviderOutcomeInput = Readonly<{
  caller: KernelCaller
  rootRunId: string
  recoveryGrantId?: string
}>

export type ReconcileProviderOutcomeResult =
  | Readonly<{ kind: 'provider_outcome_reconciled'; run: RootRunSnapshot }>
  | Readonly<{ kind: 'provider_reconciliation_pending'; rootRunId: string }>
  | Readonly<{ kind: 'provider_reconciliation_refused'; reason: string }>

export type CancelResult =
  | Readonly<{ kind: 'run_not_found' }>
  | Readonly<{ kind: 'cancellation_requested'; rootRunId: string }>
  | Readonly<{ kind: 'cancellation_not_possible'; run: RootRunSnapshot }>
  | Readonly<{ kind: 'cancellation_not_possible'; rootRunId: string; reason: 'provider_released' | 'provider_cancellation_unsupported' | 'incident_frozen' }>
  | Readonly<{ kind: 'provider_cancellation_recorded'; rootRunId: string; leafRunId: string; disposition: 'accepted' | 'rejected' | 'indeterminate'; providerReference?: string; reason?: string; run: RootRunSnapshot }>

export type ReconcileProviderCancellationInput = Readonly<{
  cancellationRequestId: string
  rootRunId: string
  leafRunId: string
  stepGrantId: string
  idempotencyKey: string
  recoveryGrantId?: string
  evidence: Readonly<{
    source: string
    observedAt: number
    disposition: 'accepted' | 'rejected'
    providerReference?: string
    reason?: string
  }>
}>

export type ReconcileProviderCancellationResult =
  | Readonly<{ kind: 'provider_cancellation_reconciled'; disposition: 'accepted' | 'rejected'; run: RootRunSnapshot }>
  | Readonly<{ kind: 'cancellation_reconciliation_refused'; reason: string }>

export type NeutralRoutingKernel = Readonly<{
  operations: Readonly<{
    route: (input: RouteInput) => Promise<RouteResult>
    prepareStructuredQuotes: (input: StructuredPreparationInput) => Promise<StructuredPreparationResult>
    execute: (input: ExecuteInput) => Promise<ExecuteResult>
    inspect: (input: InspectInput) => Promise<InspectResult>
    reconcileProviderOutcome: (input: ReconcileProviderOutcomeInput) => Promise<ReconcileProviderOutcomeResult>
    cancel: (input: CancelInput) => Promise<CancelResult>
  }>
  authority: Readonly<{
    authorize: (input: AuthorizeInput) => Promise<RouteAuthorization>
    reconcileProviderCancellation: (input: ReconcileProviderCancellationInput) => Promise<ReconcileProviderCancellationResult>
  }>
}>

export function createNeutralRoutingKernel(input: CreateNeutralRoutingKernelInput): NeutralRoutingKernel {
  const store = input.store ?? createInMemoryKernelStore()
  if (input.executionMode === 'live' && input.incidentControl === undefined) {
    throw new Error('incident_control_required_for_live_execution')
  }
  const incidentControl = input.incidentControl ?? createAllowingIncidentEvaluator()
  const prepareStructuredQuotes = createStructuredQuotePreparationOperation({
    bindings: input.bindings,
    store: input.structuredPreparationStore ?? createInMemoryStructuredQuotePreparationStore(),
    incidentControl,
    now: input.now,
    ...(input.resolveCurrentStructuredBinding === undefined ? {} : { resolveCurrentBinding: input.resolveCurrentStructuredBinding }),
  })
  const adapters = new Map(input.bindings.map((adapter) => [adapter.binding.bindingId, adapter]))

  async function route(request: RouteInput): Promise<RouteResult> {
    const query = request.query.trim()
    if (query.length === 0) return { kind: 'no_route', reason: 'query_empty' }
    if (request.routingRequestId !== undefined) {
      const routingRequestId = request.routingRequestId.trim()
      if (routingRequestId.length === 0 || routingRequestId.length > 200) return { kind: 'no_route', reason: 'routing_request_invalid' }
      const existing = await store.getQuoteByRoutingRequestId(routingRequestId)
      if (existing !== undefined) return sameRoutingRequest(existing, request, query)
        ? { kind: 'quoted', quote: existing }
        : { kind: 'no_route', reason: 'routing_request_conflict' }
    }
    const compiledAt = input.now()
    const routeAdmission = await incidentControl.evaluate(callerScope(request.networkId, request.caller), 'route')
    if (routeAdmission.kind === 'frozen') return { kind: 'no_route', reason: 'incident_frozen' }

    const initialCompilation = compileRoutingSnapshot({
      networkId: request.networkId, caller: request.caller, query, constraints: request.constraints,
      bindings: input.bindings.map((adapter) => adapter.binding), quotes: [], now: compiledAt,
      evidenceSnapshots: input.routingEvidenceSnapshots ?? [],
    })
    const relevantIds = new Set(initialCompilation.snapshot.relevantBindingIds)
    const hardExcluded = new Set(initialCompilation.decision.factors.filter((factor) => factor.refusalReason === 'health_unavailable' || factor.refusalReason === 'incident_excluded').map((factor) => factor.bindingId))
    const candidates = (await Promise.all(input.bindings
      .filter((adapter) => relevantIds.has(adapter.binding.bindingId) && !hardExcluded.has(adapter.binding.bindingId))
      .filter((adapter) => adapter.binding.adapterFeatures?.quotePreparation !== 'structured_authorized')
      .map(async (adapter) => {
        const decision = await incidentControl.evaluate(bindingScope(adapter.binding, request.caller), 'route')
        return decision.kind === 'allowed' ? adapter : undefined
      }))).filter((adapter): adapter is CapabilityBindingAdapter => adapter !== undefined)
    const quoted = await Promise.all(candidates.map(async (adapter) => ({
      bindingId: adapter.binding.bindingId,
      quote: await adapter.quote({ query }),
    })))
    const compilation = compileRoutingSnapshot({
      networkId: request.networkId, caller: request.caller, query, constraints: request.constraints,
      bindings: input.bindings.map((adapter) => adapter.binding), quotes: quoted, now: compiledAt,
      evidenceSnapshots: input.routingEvidenceSnapshots ?? [],
    })
    const graphs = compilation.graphs
    const selectedGraph = compilation.selectedGraph
    if (selectedGraph === undefined) return { kind: 'no_route', reason: 'no_eligible_graph' }
    const stepIncidents = await Promise.all(selectedGraph.steps.map(async (step) => await incidentControl.evaluate({
      ...callerScope(request.networkId, request.caller),
      bindingId: step.bindingId,
      capabilityContractId: step.capabilityContractId,
    }, 'route')))
    if (stepIncidents.some((decision) => decision.kind === 'frozen')) return { kind: 'no_route', reason: 'incident_frozen' }
    const incidentBoundSelectedGraph: CandidateGraphQuote = Object.freeze({
      ...selectedGraph,
      steps: Object.freeze(selectedGraph.steps.map((step, index) => Object.freeze({
        ...step,
        incidentEpochDigest: stepIncidents[index]!.epochDigest,
      }))),
    })
    const incident = await incidentControl.evaluate(graphScope(request.networkId, request.caller, incidentBoundSelectedGraph), 'route')
    if (incident.kind === 'frozen') return { kind: 'no_route', reason: 'incident_frozen' }

    const createdAt = input.now()
    const quoteId = input.ids.next('quote')
    const routingRequestId = request.routingRequestId?.trim() ?? input.ids.next('routing-request')
    const quoteMaterial = {
      quoteId,
      routingRequestId,
      networkId: request.networkId,
      executionMode: input.executionMode,
      caller: request.caller,
      query,
      routingSnapshot: compilation.snapshot,
      organicDecision: compilation.decision,
      createdAt,
      expiresAt: Math.min(
        createdAt + input.quoteTtlMs,
        ...incidentBoundSelectedGraph.steps.map((step) => step.providerQuoteExpiresAt ?? Number.MAX_SAFE_INTEGER),
      ),
      selectedGraph: incidentBoundSelectedGraph,
      alternatives: graphs.slice(1),
      effects: [...new Set(incidentBoundSelectedGraph.steps.map((step) => input.bindings.find((entry) => entry.binding.bindingId === step.bindingId)?.binding.operation ?? 'unknown'))],
      disclosures: incidentBoundSelectedGraph.disclosures,
      enforcement: 'required' as const,
      incidentEpochDigest: incident.epochDigest,
    }
    const quote = freezeRouteQuote({
      ...quoteMaterial,
      quoteDigest: canonicalAuthorityDigest(routeQuoteHashValue(quoteMaterial)),
    })
    await store.putQuote(quote)
    return { kind: 'quoted', quote }
  }

  async function authorize(request: AuthorizeInput): Promise<RouteAuthorization> {
    const quote = await store.getQuote(request.quoteId)
    if (quote === undefined) throw new Error('quote_not_found')
    const stepAdmission = await validateSelectedStepEpochs(quote, 'authorize')
    if (stepAdmission === 'frozen') throw new IncidentAuthorizationError('incident_frozen')
    if (stepAdmission === 'stale') throw new IncidentAuthorizationError('incident_epoch_stale')
    const incident = await incidentControl.evaluate(graphScope(quote.networkId, quote.caller, quote.selectedGraph), 'authorize')
    if (incident.kind === 'frozen') throw new IncidentAuthorizationError('incident_frozen')
    if (quote.incidentEpochDigest !== incident.epochDigest) {
      throw new IncidentAuthorizationError('incident_epoch_stale')
    }
    const allowedDataFields = request.allowedDataFields ?? []
    const disclosureSteps = quote.selectedGraph.steps.filter((step) => step.dataFields.some((field) => allowedDataFields.includes(field)))
    const recipientBindingIds = [...new Set(disclosureSteps.map((step) => step.bindingId))].sort()
    const purposes = [...new Set(disclosureSteps.map((step) => step.capabilityContractId))].sort()
    const authorization = Object.freeze({
      ...request,
      authorizationRef: request.authorizationRef ?? input.ids.next('route-authorization'),
      budgetAuthorityRef: request.budgetAuthorityRef ?? `budget-authority:${request.principalId}:${request.currency}:provider-cost-v1`,
      budgetMaximumGrossMinor: request.budgetMaximumGrossMinor ?? request.maximumSpendMinor,
      dataAuthorizationBudgetRef: request.dataAuthorizationBudgetRef ?? `data-budget:${request.principalId}:default`,
      protectedFieldSetId: request.protectedFieldSetId ?? 'field-set:kernel-input:v1',
      dataBudgetMaximumAttempts: request.dataBudgetMaximumAttempts ?? request.maximumDisclosureAttempts ?? disclosureSteps.length,
      dataBudgetMaximumExposures: request.dataBudgetMaximumExposures ?? request.maximumDisclosureExposures ?? disclosureSteps.length,
      allowedRecipientBindingIds: Object.freeze([...(request.allowedRecipientBindingIds ?? recipientBindingIds)].sort()),
      allowedDisclosurePurposes: Object.freeze([...(request.allowedDisclosurePurposes ?? purposes)].sort()),
      maximumDisclosureAttempts: Math.min(request.maximumDisclosureAttempts ?? disclosureSteps.length, disclosureSteps.length),
      maximumDisclosureExposures: Math.min(request.maximumDisclosureExposures ?? disclosureSteps.length, disclosureSteps.length),
      allowedDataFields: Object.freeze([...allowedDataFields].sort()),
      incidentEpochDigest: quote.incidentEpochDigest,
    }) satisfies RouteAuthorization
    await store.putAuthorization(authorization)
    return authorization
  }

  const execute = createExecuteOperation({
    store,
    adapters,
    incidentControl,
    ids: input.ids,
    now: input.now,
    ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
    validateSelectedStepEpochs,
  })
  const {
    reconcileProviderOutcome,
    reconcileProviderCancellation,
  } = createReconcileOperations({
    store,
    adapters,
    incidentControl,
    ids: input.ids,
    now: input.now,
  })

  async function inspect(request: InspectInput): Promise<InspectResult> {
    const run = await store.getRun(request.rootRunId)
    if (run === undefined || !sameCaller(run.caller, request.caller)) return { kind: 'run_not_found' }
    return { kind: 'run_found', run }
  }

  async function cancel(request: CancelInput): Promise<CancelResult> {
    const inspected = await inspect(request)
    if (inspected.kind === 'run_not_found') return inspected
    const incident = await incidentControl.evaluate(runIncidentScope(inspected.run), 'cancel')
    if (incident.kind === 'frozen') {
      return { kind: 'cancellation_not_possible', rootRunId: request.rootRunId, reason: 'incident_frozen' }
    }
    if (inspected.run.state === 'completed' && inspected.run.effectState === 'committed') {
      return await requestProviderCancellation(inspected.run)
    }
    if (inspected.run.state !== 'running') return { kind: 'cancellation_not_possible', run: inspected.run }
    const result = await store.requestCancellation(request.rootRunId, request.caller, input.now())
    if (typeof result === 'object' && result.kind === 'incident_frozen') {
      return { kind: 'cancellation_not_possible', rootRunId: request.rootRunId, reason: 'incident_frozen' }
    }
    if (result === 'requested') return { kind: 'cancellation_requested', rootRunId: request.rootRunId }
    if (result === 'not_possible') return { kind: 'cancellation_not_possible', rootRunId: request.rootRunId, reason: 'provider_released' }
    return { kind: 'run_not_found' }

    async function requestProviderCancellation(current: RootRunSnapshot): Promise<CancelResult> {
      const leaf = [...current.leaves].reverse().find((candidate) => candidate.effectState === 'committed')
      if (leaf === undefined) return { kind: 'cancellation_not_possible', run: current }
      const adapter = adapters.get(leaf.bindingId)
      if (adapter?.binding.adapterFeatures?.requestCancellation !== 'supported' || adapter.requestCancellation === undefined) {
        return { kind: 'cancellation_not_possible', rootRunId: current.rootRunId, reason: 'provider_cancellation_unsupported' }
      }
      const existing = await store.getProviderCancellation(current.rootRunId)
      if (existing !== undefined) return providerCancellationResult(existing, await store.getRun(current.rootRunId) ?? current)
      const cancellationRequestId = `provider-cancellation:${current.rootRunId}:${leaf.leafRunId}`
      const idempotencyKey = `${current.rootRunId}:cancel:${leaf.leafRunId}:${leaf.stepGrantId}`
      const requestedAt = input.now()
      const pending = Object.freeze({
        cancellationRequestId, rootRunId: current.rootRunId, leafRunId: leaf.leafRunId,
        stepGrantId: leaf.stepGrantId, bindingId: leaf.bindingId, idempotencyKey,
        disposition: 'pending' as const, requestedAt,
      })
      const requestedRun = Object.freeze({ ...current, records: Object.freeze([...current.records, record(input.ids, requestedAt, current.rootRunId, 'provider_cancellation_requested', {
        leafRunId: leaf.leafRunId, bindingId: leaf.bindingId, cancellationRequestId, incidentEpochDigest: current.incidentEpochDigest,
      })]) })
      const claim = await store.claimProviderCancellation(pending, requestedRun)
      if (typeof claim === 'object' && claim.kind === 'incident_frozen') {
        return { kind: 'cancellation_not_possible', rootRunId: current.rootRunId, reason: 'incident_frozen' }
      }
      if (claim === 'conflict') return { kind: 'cancellation_not_possible', rootRunId: current.rootRunId, reason: 'provider_released' }
      if (claim === 'existing') {
        const replay = await store.getProviderCancellation(current.rootRunId)
        if (replay !== undefined) return providerCancellationResult(replay, await store.getRun(current.rootRunId) ?? requestedRun)
      }
      const provider = await adapter.requestCancellation({
        rootRunId: current.rootRunId, leafRunId: leaf.leafRunId, stepGrantId: leaf.stepGrantId, idempotencyKey,
      }).catch(() => ({ kind: 'cancellation_unknown' as const }))
      const disposition = provider.kind === 'cancellation_accepted' ? 'accepted' as const
        : provider.kind === 'cancellation_rejected' ? 'rejected' as const : 'indeterminate' as const
      const resolvedAt = input.now()
      const resolved = Object.freeze({
        ...pending, disposition, resolvedAt,
        ...('providerReference' in provider && provider.providerReference !== undefined ? { providerReference: provider.providerReference } : {}),
        ...(provider.kind === 'cancellation_rejected' ? { reason: provider.reason } : {}),
      })
      const latest = await store.getRun(current.rootRunId) ?? requestedRun
      const type = disposition === 'accepted' ? 'provider_cancellation_accepted' as const
        : disposition === 'rejected' ? 'provider_cancellation_rejected' as const : 'provider_cancellation_unknown' as const
      const resolvedRun = Object.freeze({ ...latest, records: Object.freeze([...latest.records, record(input.ids, resolvedAt, current.rootRunId, type, {
        leafRunId: leaf.leafRunId, bindingId: leaf.bindingId, cancellationRequestId, cancellationDisposition: disposition, incidentEpochDigest: latest.incidentEpochDigest,
        ...(resolved.providerReference === undefined ? {} : { providerReference: resolved.providerReference }),
        ...(resolved.reason === undefined ? {} : { cancellationReason: resolved.reason }),
      })]) })
      const resolution = await store.resolveProviderCancellation(resolved, resolvedRun)
      if (typeof resolution === 'object' && resolution.kind === 'incident_frozen') {
        return { kind: 'cancellation_not_possible', rootRunId: current.rootRunId, reason: 'incident_frozen' }
      }
      if (resolution !== 'resolved') {
        const persisted = await store.getProviderCancellation(current.rootRunId)
        if (persisted !== undefined) return providerCancellationResult(persisted, await store.getRun(current.rootRunId) ?? requestedRun)
      }
      return providerCancellationResult(resolved, resolvedRun)
    }
  }


  const kernel = {
    operations: Object.freeze({ route, prepareStructuredQuotes, execute, inspect, reconcileProviderOutcome, cancel }),
    authority: Object.freeze({ authorize, reconcileProviderCancellation }),
  } satisfies NeutralRoutingKernel
  return Object.freeze(kernel)

  async function validateSelectedStepEpochs(
    quote: RouteQuote,
    action: Parameters<IncidentEvaluator['evaluate']>[1],
  ): Promise<'allowed' | 'frozen' | 'stale'> {
    const decisions = await Promise.all(quote.selectedGraph.steps.map(async (step) => await incidentControl.evaluate({
      ...callerScope(quote.networkId, quote.caller),
      bindingId: step.bindingId,
      capabilityContractId: step.capabilityContractId,
    }, action)))
    if (decisions.some((decision) => decision.kind === 'frozen')) return 'frozen'
    return decisions.every((decision, index) => quote.selectedGraph.steps[index]?.incidentEpochDigest === decision.epochDigest)
      ? 'allowed'
      : 'stale'
  }
}

function sameRoutingRequest(existing: RouteQuote, request: RouteInput, normalizedQuery: string): boolean {
  const optimizeFor = request.constraints.optimizeFor ?? 'cost'
  return existing.networkId === request.networkId
    && sameCaller(existing.caller, request.caller)
    && existing.query === normalizedQuery
    && existing.routingSnapshot.constraints.currency === request.constraints.currency
    && existing.routingSnapshot.constraints.maximumSpendMinor === request.constraints.maximumSpendMinor
    && existing.routingSnapshot.constraints.optimizeFor === optimizeFor
}

function providerCancellationResult(cancellation: ProviderCancellation, run: RootRunSnapshot): CancelResult {
  return {
    kind: 'provider_cancellation_recorded', rootRunId: cancellation.rootRunId, leafRunId: cancellation.leafRunId,
    disposition: cancellation.disposition === 'pending' ? 'indeterminate' : cancellation.disposition,
    ...(cancellation.providerReference === undefined ? {} : { providerReference: cancellation.providerReference }),
    ...(cancellation.reason === undefined ? {} : { reason: cancellation.reason }),
    run,
  }
}

function freezeRouteQuote(quote: RouteQuote): RouteQuote {
  const freezeStep = (step: CandidateGraphStepQuote): CandidateGraphStepQuote => Object.freeze({
    ...step,
    expectedCost: Object.freeze({ ...step.expectedCost }),
    maximumCost: Object.freeze({ ...step.maximumCost }),
    disclosures: Object.freeze([...step.disclosures]),
    dataFields: Object.freeze([...step.dataFields]),
  })
  const freezeGraph = (graph: CandidateGraphQuote): CandidateGraphQuote => Object.freeze({
    ...graph,
    expectedCost: Object.freeze({ ...graph.expectedCost }),
    maximumCost: Object.freeze({ ...graph.maximumCost }),
    disclosures: Object.freeze([...graph.disclosures]),
    dataFields: Object.freeze([...graph.dataFields]),
    steps: Object.freeze(graph.steps.map(freezeStep)),
  })

  return Object.freeze({
    ...quote,
    caller: Object.freeze({ ...quote.caller }),
    routingSnapshot: Object.freeze({
      ...quote.routingSnapshot,
      caller: Object.freeze({ ...quote.routingSnapshot.caller }),
      constraints: Object.freeze({ ...quote.routingSnapshot.constraints }),
      eligibleBindingIds: Object.freeze([...quote.routingSnapshot.eligibleBindingIds]),
      relevantBindingIds: Object.freeze([...quote.routingSnapshot.relevantBindingIds]),
    }),
    organicDecision: Object.freeze({
      ...quote.organicDecision,
      factors: Object.freeze(quote.organicDecision.factors.map((factor) => Object.freeze({ ...factor }))),
    }),
    selectedGraph: freezeGraph(quote.selectedGraph),
    alternatives: Object.freeze(quote.alternatives.map(freezeGraph)),
    effects: Object.freeze([...quote.effects]),
    disclosures: Object.freeze([...quote.disclosures]),
  })
}

function routeQuoteHashValue(value: Omit<RouteQuote, 'quoteDigest'>): StableHashValue {
  return {
    quoteId: value.quoteId,
    routingRequestId: value.routingRequestId,
    networkId: value.networkId,
    executionMode: value.executionMode,
    caller: { agentId: value.caller.agentId, principalId: value.caller.principalId },
    query: value.query,
    routingSnapshot: {
      compilerVersion: value.routingSnapshot.compilerVersion,
      optimizerVersion: value.routingSnapshot.optimizerVersion,
      networkPolicyVersion: value.routingSnapshot.networkPolicyVersion,
      networkId: value.routingSnapshot.networkId,
      caller: { agentId: value.routingSnapshot.caller.agentId, principalId: value.routingSnapshot.caller.principalId },
      normalizedQuery: value.routingSnapshot.normalizedQuery,
      constraints: value.routingSnapshot.constraints,
      eligibleBindingIds: value.routingSnapshot.eligibleBindingIds,
      relevantBindingIds: value.routingSnapshot.relevantBindingIds,
    },
    organicDecision: {
      optimizerVersion: value.organicDecision.optimizerVersion,
      optimizeFor: value.organicDecision.optimizeFor,
      ...(value.organicDecision.selectedBindingId === undefined ? {} : { selectedBindingId: value.organicDecision.selectedBindingId }),
      factors: value.organicDecision.factors.map((factor) => ({ ...factor })),
    },
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    selectedGraph: graphHashValue(value.selectedGraph),
    alternatives: value.alternatives.map(graphHashValue),
    effects: value.effects,
    disclosures: value.disclosures,
    enforcement: value.enforcement,
    ...(value.incidentEpochDigest === undefined ? {} : { incidentEpochDigest: value.incidentEpochDigest }),
  }
}

export class IncidentAuthorizationError extends Error {
  constructor(readonly code: 'incident_frozen' | 'incident_epoch_stale') {
    super(code)
    this.name = 'IncidentAuthorizationError'
  }
}

function graphHashValue(graph: CandidateGraphQuote): StableHashValue {
  return {
    bindingId: graph.bindingId,
    nodeId: graph.nodeId,
    capabilityContractId: graph.capabilityContractId,
    expectedCost: { currency: graph.expectedCost.currency, amountMinor: graph.expectedCost.amountMinor },
    maximumCost: { currency: graph.maximumCost.currency, amountMinor: graph.maximumCost.amountMinor },
    expectedLatencyMs: graph.expectedLatencyMs,
    dataFields: graph.dataFields,
    disclosures: graph.disclosures,
    steps: graph.steps.map((step) => ({
      role: step.role,
      ...(step.trigger === undefined ? {} : { trigger: step.trigger }),
      bindingId: step.bindingId,
      nodeId: step.nodeId,
      capabilityContractId: step.capabilityContractId,
      expectedCost: { currency: step.expectedCost.currency, amountMinor: step.expectedCost.amountMinor },
      maximumCost: { currency: step.maximumCost.currency, amountMinor: step.maximumCost.amountMinor },
      expectedLatencyMs: step.expectedLatencyMs,
      ...(step.providerQuoteRef === undefined ? {} : { providerQuoteRef: step.providerQuoteRef }),
      ...(step.providerQuoteExpiresAt === undefined ? {} : { providerQuoteExpiresAt: step.providerQuoteExpiresAt }),
      ...(step.incidentEpochDigest === undefined ? {} : { incidentEpochDigest: step.incidentEpochDigest }),
      dataFields: step.dataFields,
      disclosures: step.disclosures,
    })),
  }
}

