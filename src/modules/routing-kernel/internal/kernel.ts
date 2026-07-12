import type { StableHashValue } from '@/modules/common/stable-hash'
import { canonicalAuthorityDigest } from './authority-digest'

import type {
  CandidateGraphQuote,
  CandidateGraphStepQuote,
  CapabilityBindingAdapter,
  KernelCaller,
  KernelIdFactory,
  Money,
  ProtocolRecord,
  RootRunSnapshot,
  RouteAuthorization,
  RouteQuote,
  StepGrant,
  DisclosureGrant,
} from './model'
import { createStepGrant } from './step-grant'
import { createDisclosureGrant } from './disclosure-grant'
import { compileRoutingSnapshot, type BindingRoutingEvidenceSnapshot, type RoutingPriority } from './routing-compiler'
import { createAllowingIncidentEvaluator, type IncidentEvaluation, type IncidentEvaluator, type IncidentScope } from '../incident-control'

const EXECUTION_RECOVERY_LEASE_MS = 30_000
import { createInMemoryKernelStore, type KernelStore, type ProviderCancellation } from './store'

export type CreateNeutralRoutingKernelInput = Readonly<{
  now: () => number
  executionMode: 'simulation' | 'live'
  ids: KernelIdFactory
  quoteTtlMs: number
  bindings: readonly CapabilityBindingAdapter[]
  routingEvidenceSnapshots?: readonly BindingRoutingEvidenceSnapshot[]
  store?: KernelStore
  incidentControl?: IncidentEvaluator
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

  async function execute(request: ExecuteInput): Promise<ExecuteResult> {
    if ((request.executionPurpose === 'incident_canary') !== (request.canaryRecoveryGrantId !== undefined)) {
      return { kind: 'execution_refused', reason: 'canary_recovery_authority_required' }
    }
    const executionScope = `${request.caller.agentId}:${request.caller.principalId}:${request.idempotencyKey}`
    const data = Object.freeze({ ...(request.data ?? {}) })
    const requestDigest = createExecutionRequestDigest(request, data)
    const existingExecution = await store.getExecution(executionScope)
    if (existingExecution?.kind === 'completed') {
      return existingExecution.requestDigest === requestDigest
        ? { kind: 'run_admitted', run: existingExecution.run }
        : { kind: 'execution_refused', reason: 'idempotency_payload_mismatch' }
    }
    if (existingExecution?.kind === 'pending') {
      if (existingExecution.requestDigest !== requestDigest) return { kind: 'execution_refused', reason: 'idempotency_payload_mismatch' }
      const running = await store.getRun(existingExecution.rootRunId)
      if (running === undefined) return { kind: 'execution_pending', rootRunId: existingExecution.rootRunId }
      return await recoverReleasedExecution({
        executionScope, request, running, claimedAt: existingExecution.claimedAt, store, adapters,
        incidentControl, ids: input.ids, now: input.now,
      })
    }

    const quote = await store.getQuote(request.quoteId)
    if (quote === undefined || quote.quoteDigest !== request.quoteDigest) {
      return { kind: 'execution_refused', reason: 'quote_not_found' }
    }
    const stepAdmission = await validateSelectedStepEpochs(quote, 'root_admission')
    if (stepAdmission === 'frozen') return { kind: 'execution_refused', reason: 'incident_frozen' }
    if (stepAdmission === 'stale') return { kind: 'execution_refused', reason: 'incident_epoch_stale' }
    const rootAdmission = await incidentControl.evaluate(graphScope(quote.networkId, quote.caller, quote.selectedGraph), 'root_admission')
    if (rootAdmission.kind === 'frozen') return { kind: 'execution_refused', reason: 'incident_frozen' }
    if (quote.incidentEpochDigest !== rootAdmission.epochDigest) {
      return { kind: 'execution_refused', reason: 'incident_epoch_stale' }
    }
    const authorization = await store.getAuthorization(request.authorizationRef)
    const refusal = authorizationRefusal(quote, authorization, request.caller, input.now())
    if (refusal !== undefined) return { kind: 'execution_refused', reason: refusal }
    if (authorization === undefined) return { kind: 'execution_refused', reason: 'authorization_not_found' }
    if (authorization.incidentEpochDigest !== rootAdmission.epochDigest) {
      return { kind: 'execution_refused', reason: 'incident_epoch_stale' }
    }
    if (Object.keys(data).some((field) => !authorization.allowedDataFields.includes(field))) {
      return { kind: 'execution_refused', reason: 'data_authority_exceeded' }
    }
    if (Object.keys(data).some((field) => !quote.selectedGraph.dataFields.includes(field))) {
      return { kind: 'execution_refused', reason: 'data_not_declared_by_quote' }
    }

    const adapter = adapters.get(quote.selectedGraph.bindingId)
    if (adapter === undefined) return { kind: 'execution_refused', reason: 'binding_unavailable' }
    const primary = quote.selectedGraph.steps.at(0)
    if (primary === undefined) return { kind: 'execution_refused', reason: 'quote_not_found' }
    const primaryData = projectDataForStep(data, primary.dataFields)
    if (request.executionPurpose === 'incident_canary') {
      const canaryScope = graphScope(quote.networkId, quote.caller, quote.selectedGraph)
      const providerCanaryTarget = await incidentControl.evaluate(canaryScope, 'provider_release')
      const dataCanaryTarget = Object.keys(primaryData).length === 0
        ? undefined : await incidentControl.evaluate(canaryScope, 'data_release')
      if (providerCanaryTarget.kind !== 'frozen' && dataCanaryTarget?.kind !== 'frozen') {
        return { kind: 'execution_refused', reason: 'canary_active_freeze_required' }
      }
    }

    const rootRunId = input.ids.next('root-run')
    const leafRunId = input.ids.next('leaf-run')
    const stepGrantId = input.ids.next('step-grant')
    const occurredAt = input.now()
    const primaryGrant = grantForStep({
      quote, step: primary, rootRunId, leafRunId, stepGrantId, requestDigest,
      disclosedDataFields: Object.keys(primaryData), attempt: 1, issuedAt: occurredAt,
      expiresAt: authorization.expiresAt,
    })
    const primaryDisclosureGrant = disclosureGrantForStep({ authorization, step: primary, stepGrant: primaryGrant, data: primaryData })
    const admitted = admittedRun({
      quote,
      rootRunId,
      leafRunId,
      stepGrantId,
      authorized: money(authorization.currency, authorization.maximumSpendMinor),
      budgetAuthorityRef: authorization.budgetAuthorityRef,
      budgetMaximumGrossMinor: authorization.budgetMaximumGrossMinor,
      ids: input.ids,
      occurredAt,
    })
    const claim = await store.claimExecution({
      executionScope,
      rootRunId,
      authorizationRef: authorization.authorizationRef,
      consumedAt: occurredAt,
      caller: request.caller,
      run: admitted,
      requestDigest,
    })
    if (claim.kind === 'completed') {
      return claim.requestDigest === requestDigest
        ? { kind: 'run_admitted', run: claim.run }
        : { kind: 'execution_refused', reason: 'idempotency_payload_mismatch' }
    }
    if (claim.kind === 'pending') return { kind: 'execution_pending', rootRunId: claim.rootRunId }
    if (claim.kind === 'refused') return { kind: 'execution_refused', reason: claim.reason }

    await input.lifecycle?.afterRootAdmission?.({ rootRunId, leafRunId, bindingId: adapter.binding.bindingId })
    const released = releasedRun({
      run: admitted, grant: primaryGrant,
      ...(primaryDisclosureGrant === undefined ? {} : { disclosureGrant: primaryDisclosureGrant }),
      ...(request.executionPurpose === 'incident_canary' ? { canaryRecoveryGrantId: request.canaryRecoveryGrantId } : {}),
      ids: input.ids, occurredAt: input.now(),
    })
    const providerRelease = await incidentControl.evaluate(graphScope(quote.networkId, quote.caller, quote.selectedGraph), 'provider_release')
    if (providerRelease.kind === 'frozen') {
      const authorized = request.executionPurpose === 'incident_canary'
        && (store.incidentRecoveryAuthority === 'atomic'
          || await claimCanaryRecovery(
            request.canaryRecoveryGrantId, graphScope(quote.networkId, quote.caller, quote.selectedGraph), stepGrantId,
            { quote, authorization, requestDigest, step: primary, dataFields: Object.keys(primaryData) },
          ))
      if (!authorized) {
        const run = incidentFrozenRun({ run: admitted, decision: providerRelease, ids: input.ids, occurredAt: input.now() })
        await store.completeExecution(executionScope, run)
        return { kind: 'run_admitted', run }
      }
    }
    if (primaryGrant.incidentEpochDigest !== providerRelease.epochDigest) {
      const run = incidentEpochStaleRun({ run: admitted, epochDigest: providerRelease.epochDigest, ids: input.ids, occurredAt: input.now() })
      await store.completeExecution(executionScope, run)
      return { kind: 'run_admitted', run }
    }
    if (primaryDisclosureGrant !== undefined) {
      const dataRelease = await incidentControl.evaluate(graphScope(quote.networkId, quote.caller, quote.selectedGraph), 'data_release')
      if (dataRelease.kind === 'frozen') {
        const authorized = request.executionPurpose === 'incident_canary'
          && (store.incidentRecoveryAuthority === 'atomic'
            || await claimCanaryRecovery(
              request.canaryRecoveryGrantId, graphScope(quote.networkId, quote.caller, quote.selectedGraph), stepGrantId,
              { quote, authorization, requestDigest, step: primary, dataFields: Object.keys(primaryData) },
            ))
        if (!authorized) {
          const run = incidentFrozenRun({ run: admitted, decision: dataRelease, ids: input.ids, occurredAt: input.now() })
          await store.completeExecution(executionScope, run)
          return { kind: 'run_admitted', run }
        }
      }
      if (primaryDisclosureGrant.incidentEpochDigest !== dataRelease.epochDigest) {
        const run = incidentEpochStaleRun({ run: admitted, epochDigest: dataRelease.epochDigest, ids: input.ids, occurredAt: input.now() })
        await store.completeExecution(executionScope, run)
        return { kind: 'run_admitted', run }
      }
    }
    const release = await store.authorizeProviderRelease({
      grant: primaryGrant,
      ...(primaryDisclosureGrant === undefined ? {} : { disclosureGrant: primaryDisclosureGrant }),
      releasedAt: input.now(),
      run: released,
      ...(request.executionPurpose === 'incident_canary' ? { canaryRecoveryGrantId: request.canaryRecoveryGrantId } : {}),
    })
    if (release === 'cancelled') {
      const run = cancelledRun({ quote, rootRunId, authorized: money(claim.authorization.currency, claim.authorization.maximumSpendMinor), budgetAuthorityRef: claim.authorization.budgetAuthorityRef, budgetMaximumGrossMinor: claim.authorization.budgetMaximumGrossMinor, ids: input.ids, occurredAt: input.now() })
      await store.completeExecution(executionScope, run)
      return { kind: 'run_admitted', run }
    }
    if (typeof release === 'object') {
      const run = release.kind === 'incident_frozen'
        ? incidentFrozenRun({
            run: admitted,
            decision: {
              kind: 'frozen', epochDigest: release.epochDigest, freezeOrderId: release.freezeOrderId,
              incidentId: release.incidentId, reason: release.reason,
            },
            ids: input.ids,
            occurredAt: input.now(),
          })
        : incidentEpochStaleRun({ run: admitted, epochDigest: release.epochDigest, ids: input.ids, occurredAt: input.now() })
      await store.completeExecution(executionScope, run)
      return { kind: 'run_admitted', run }
    }
    if (release !== 'released' && release !== 'already_released') return { kind: 'execution_refused', reason: 'execution_claim_lost' }

    const records: ProtocolRecord[] = [...released.records]

    const outcome = await adapter.execute({ rootRunId, leafRunId, stepGrantId, idempotencyKey: request.idempotencyKey, ...(primary.providerQuoteRef === undefined ? {} : { providerQuoteRef: primary.providerQuoteRef }), data: primaryData })
      .catch(() => ({ kind: 'outcome_unknown' as const }))
    if (primaryDisclosureGrant !== undefined && 'dataReleaseDisposition' in outcome && outcome.dataReleaseDisposition === 'released') await store.resolveDisclosureAttempt(primaryDisclosureGrant.disclosureGrantId, 'released', input.now())
    await input.lifecycle?.afterProviderOutcome?.({ rootRunId, leafRunId, bindingId: adapter.binding.bindingId })
    const authorized = money(claim.authorization.currency, claim.authorization.maximumSpendMinor)

    if (outcome.kind === 'effect_not_committed') {
      const fallback = quote.selectedGraph.steps.find((step) => step.role === 'fallback')
      if (fallback !== undefined) {
        const fallbackAdapter = adapters.get(fallback.bindingId)
        if (fallbackAdapter !== undefined) {
          const run = await executeFallbackAfterDefiniteFailure({
            quote, rootRunId, primaryLeafRunId: leafRunId, primaryStepGrantId: stepGrantId, primary,
            primaryOutcome: outcome, fallback, fallbackAdapter, authorized, records, data, store,
            idempotencyKey: request.idempotencyKey, requestDigest, authorization,
            ids: input.ids, now: input.now,
          })
          await store.completeExecution(executionScope, run)
          return { kind: 'run_admitted', run }
        }
      }
    }

    const run = outcome.kind === 'effect_committed'
      ? completedRun({ quote, rootRunId, leafRunId, stepGrantId, authorized, providerReference: outcome.providerReference, outcome: outcome.outcome, reportedCost: outcome.reportedCost, records, ids: input.ids, occurredAt })
      : outcome.kind === 'effect_not_committed'
        ? failedRun({ quote, rootRunId, leafRunId, stepGrantId, authorized, reason: outcome.reason, ...outcome.providerReference === undefined ? {} : { providerReference: outcome.providerReference }, records, ids: input.ids, occurredAt })
      : unknownRun({
          quote,
          rootRunId,
          leafRunId,
          stepGrantId,
          authorized,
          ...('providerReference' in outcome && outcome.providerReference !== undefined
            ? { providerReference: outcome.providerReference }
            : {}),
          records,
          ids: input.ids,
          occurredAt,
        })

    await store.completeExecution(executionScope, run)
    return { kind: 'run_admitted', run }
  }

  async function inspect(request: InspectInput): Promise<InspectResult> {
    const run = await store.getRun(request.rootRunId)
    if (run === undefined || !sameCaller(run.caller, request.caller)) return { kind: 'run_not_found' }
    return { kind: 'run_found', run }
  }

  async function reconcileProviderOutcome(request: ReconcileProviderOutcomeInput): Promise<ReconcileProviderOutcomeResult> {
    const current = await store.getRun(request.rootRunId)
    if (current === undefined || !sameCaller(current.caller, request.caller)) {
      return { kind: 'provider_reconciliation_refused', reason: 'run_not_found' }
    }
    if (current.state !== 'outcome_unknown') {
      return { kind: 'provider_reconciliation_refused', reason: 'run_not_unknown' }
    }
    const leaf = [...current.leaves].reverse().find((candidate) => candidate.state === 'outcome_unknown')
    if (leaf === undefined) return { kind: 'provider_reconciliation_refused', reason: 'unknown_leaf_not_found' }
    const adapter = adapters.get(leaf.bindingId)
    if (adapter === undefined) return { kind: 'provider_reconciliation_refused', reason: 'binding_unavailable' }
    const quote = await store.getQuote(current.quoteId)
    if (quote === undefined || quote.quoteDigest !== current.quoteDigest) {
      return { kind: 'provider_reconciliation_refused', reason: 'quote_not_found' }
    }
    const step = quote.selectedGraph.steps.find((candidate) => candidate.bindingId === leaf.bindingId)
    if (step === undefined) return { kind: 'provider_reconciliation_refused', reason: 'quoted_step_not_found' }

    const scope = runIncidentScope(current, leaf)
    const incident = await incidentControl.evaluate(scope, 'reconcile')
    if (incident.kind === 'frozen') {
      const recovered = await claimRecovery({
        recoveryGrantId: request.recoveryGrantId,
        scope,
        operationRef: `provider-reconcile:${canonicalAuthorityDigest({ rootRunId: current.rootRunId, quoteDigest: current.quoteDigest, leafRunId: leaf.leafRunId, stepGrantId: leaf.stepGrantId })}`,
      })
      if (!recovered) return { kind: 'provider_reconciliation_refused', reason: 'incident_frozen' }
    }

    const outcome = await adapter.reconcile({
      rootRunId: current.rootRunId,
      leafRunId: leaf.leafRunId,
      stepGrantId: leaf.stepGrantId,
      idempotencyKey: `${current.rootRunId}:reconcile:${leaf.leafRunId}:${leaf.stepGrantId}`,
      ...(step.providerQuoteRef === undefined ? {} : { providerQuoteRef: step.providerQuoteRef }),
    }).catch(() => ({ kind: 'reconciliation_pending' as const }))
    if (outcome.kind === 'reconciliation_pending' || outcome.kind === 'outcome_unknown') {
      return { kind: 'provider_reconciliation_pending', rootRunId: current.rootRunId }
    }

    const observedAt = input.now()
    const providerReference = outcome.providerReference ?? leaf.providerReference
    const evidenceRecord = record(input.ids, observedAt, current.rootRunId, 'provider_reconciliation_observed', {
      leafRunId: leaf.leafRunId,
      bindingId: leaf.bindingId,
      ...(providerReference === undefined ? {} : { providerReference }),
      evidenceSource: 'provider_adapter_reconcile',
      incidentEpochDigest: current.incidentEpochDigest,
      ...(outcome.kind === 'effect_committed' ? providerCostRecord(outcome.reportedCost) : {}),
    })
    const resolvedLeaf = outcome.kind === 'effect_committed'
      ? Object.freeze({ ...leaf, state: 'completed' as const, attemptDisposition: 'dispatched' as const, effectState: 'committed' as const, providerReference: outcome.providerReference, outcome: outcome.outcome })
      : Object.freeze({ ...leaf, state: 'failed' as const, attemptDisposition: 'dispatched' as const, effectState: 'not_committed' as const, ...(providerReference === undefined ? {} : { providerReference }), failureReason: outcome.reason })
    const resolved: RootRunSnapshot = Object.freeze({
      ...current,
      state: outcome.kind === 'effect_committed' ? 'completed' as const : 'failed' as const,
      effectState: outcome.kind === 'effect_committed' ? 'committed' as const : 'not_committed' as const,
      cost: outcome.kind === 'effect_committed'
        ? { ...current.cost, reserved: null, providerReported: outcome.reportedCost ?? null, settled: null }
        : { ...current.cost, reserved: null, providerReported: null, settled: null },
      leaves: current.leaves.map((candidate) => candidate.leafRunId === leaf.leafRunId ? resolvedLeaf : candidate),
      records: [...current.records, evidenceRecord, record(input.ids, observedAt, current.rootRunId, 'root_run_reconciled', { incidentEpochDigest: current.incidentEpochDigest })],
    })
    const applied = await store.reconcileRun(current.rootRunId, leaf.leafRunId, resolved)
    if (typeof applied !== 'string') return { kind: 'provider_reconciliation_refused', reason: 'incident_frozen' }
    if (applied === 'applied') return { kind: 'provider_outcome_reconciled', run: resolved }
    return { kind: 'provider_reconciliation_refused', reason: applied }
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

  async function reconcileProviderCancellation(request: ReconcileProviderCancellationInput): Promise<ReconcileProviderCancellationResult> {
    const cancellation = await store.getProviderCancellation(request.rootRunId)
    const current = await store.getRun(request.rootRunId)
    if (cancellation === undefined || current === undefined) return { kind: 'cancellation_reconciliation_refused', reason: 'cancellation_not_found' }
    const incident = await incidentControl.evaluate(runIncidentScope(current), 'reconcile')
    if (incident.kind === 'frozen') {
      const recovery = await claimRecovery({
        recoveryGrantId: request.recoveryGrantId, scope: runIncidentScope(current),
        operationRef: `reconcile-cancellation:${canonicalAuthorityDigest(request)}`,
      })
      if (!recovery) return { kind: 'cancellation_reconciliation_refused', reason: 'incident_frozen' }
    }
    if (cancellation.cancellationRequestId !== request.cancellationRequestId
      || cancellation.rootRunId !== request.rootRunId
      || cancellation.leafRunId !== request.leafRunId
      || cancellation.stepGrantId !== request.stepGrantId
      || cancellation.idempotencyKey !== request.idempotencyKey) {
      return { kind: 'cancellation_reconciliation_refused', reason: 'cancellation_identity_mismatch' }
    }
    if (cancellation.disposition !== 'pending' && cancellation.disposition !== 'indeterminate') {
      return { kind: 'cancellation_reconciliation_refused', reason: 'cancellation_already_resolved' }
    }
    if (request.evidence.source.trim().length === 0 || request.evidence.observedAt < cancellation.requestedAt
      || (request.evidence.disposition === 'rejected'
        && (request.evidence.reason === undefined || request.evidence.reason.trim().length === 0))) {
      return { kind: 'cancellation_reconciliation_refused', reason: 'invalid_evidence' }
    }
    const resolved = Object.freeze({
      ...cancellation,
      disposition: request.evidence.disposition,
      resolvedAt: request.evidence.observedAt,
      ...(request.evidence.providerReference === undefined ? {} : { providerReference: request.evidence.providerReference }),
      ...(request.evidence.reason === undefined ? {} : { reason: request.evidence.reason }),
    })
    const recordType = request.evidence.disposition === 'accepted'
      ? 'provider_cancellation_accepted' as const : 'provider_cancellation_rejected' as const
    const reconciledRun = Object.freeze({ ...current, records: Object.freeze([...current.records, record(
      input.ids, request.evidence.observedAt, current.rootRunId, recordType, {
        leafRunId: cancellation.leafRunId,
        bindingId: cancellation.bindingId,
        cancellationRequestId: cancellation.cancellationRequestId,
        cancellationDisposition: request.evidence.disposition,
        evidenceSource: request.evidence.source,
        incidentEpochDigest: current.incidentEpochDigest,
        ...(request.evidence.providerReference === undefined ? {} : { providerReference: request.evidence.providerReference }),
        ...(request.evidence.reason === undefined ? {} : { cancellationReason: request.evidence.reason }),
      },
    )]) })
    const applied = await store.resolveProviderCancellation(resolved, reconciledRun)
    if (typeof applied !== 'string') {
      return { kind: 'cancellation_reconciliation_refused', reason: 'incident_frozen' }
    }
    if (applied === 'resolved') {
      return { kind: 'provider_cancellation_reconciled', disposition: request.evidence.disposition, run: reconciledRun }
    }
    return { kind: 'cancellation_reconciliation_refused', reason: applied }
  }

  const kernel = {
    operations: Object.freeze({ route, execute, inspect, reconcileProviderOutcome, cancel }),
    authority: Object.freeze({ authorize, reconcileProviderCancellation }),
  } satisfies NeutralRoutingKernel
  return Object.freeze(kernel)

  async function claimRecovery(request: {
    recoveryGrantId: string | undefined
    scope: IncidentScope
    operationRef: string
  }): Promise<boolean> {
    if (request.recoveryGrantId === undefined || incidentControl.claimRecovery === undefined) return false
    const result = await incidentControl.claimRecovery({
      recoveryGrantId: request.recoveryGrantId, lane: 'reconcile', scope: request.scope,
      operationRef: request.operationRef, usedAt: input.now(),
    })
    return result.kind === 'recovery_authorized'
  }

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

  async function claimCanaryRecovery(
    recoveryGrantId: string | undefined,
    scope: IncidentScope,
    operationRef: string,
    plan: {
      quote: RouteQuote; authorization: RouteAuthorization; requestDigest: string
      step: CandidateGraphStepQuote; dataFields: string[]
    },
  ): Promise<boolean> {
    if (recoveryGrantId === undefined || incidentControl.claimRecovery === undefined) return false
    const result = await incidentControl.claimRecovery({
      recoveryGrantId, lane: 'canary', scope, operationRef, usedAt: input.now(),
      canaryExecution: {
        quoteId: plan.quote.quoteId, quoteDigest: plan.quote.quoteDigest,
        authorizationRef: plan.authorization.authorizationRef, requestDigest: plan.requestDigest,
        bindingId: plan.step.bindingId, capabilityContractId: plan.step.capabilityContractId,
        maximumSpendMinor: plan.authorization.maximumSpendMinor, currency: plan.authorization.currency,
        allowedDataFields: [...plan.dataFields].sort(),
      },
    })
    return result.kind === 'recovery_authorized'
  }
}

async function recoverReleasedExecution(input: {
  executionScope: string
  request: ExecuteInput
  running: RootRunSnapshot
  claimedAt: number
  store: KernelStore
  adapters: ReadonlyMap<string, CapabilityBindingAdapter>
  incidentControl: IncidentEvaluator
  ids: KernelIdFactory
  now: () => number
}): Promise<ExecuteResult> {
  const leaf = [...input.running.leaves].reverse().find((candidate) => candidate.state === 'released')
  if (leaf === undefined) {
    const pending = input.running.leaves.find((candidate) => candidate.state === 'pending' && candidate.attemptDisposition === 'not_released')
    return pending === undefined || input.now() < input.claimedAt + EXECUTION_RECOVERY_LEASE_MS
      ? { kind: 'execution_pending', rootRunId: input.running.rootRunId }
      : await resumeAdmittedExecution({ ...input, leaf: pending })
  }
  const adapter = input.adapters.get(leaf.bindingId)
  if (adapter === undefined) return { kind: 'execution_pending', rootRunId: input.running.rootRunId }
  const quote = await input.store.getQuote(input.running.quoteId)
  const step = quote?.selectedGraph.steps.find((candidate) => candidate.bindingId === leaf.bindingId)
  if (step === undefined) return { kind: 'execution_pending', rootRunId: input.running.rootRunId }
  const incident = await input.incidentControl.evaluate(runIncidentScope(input.running, leaf), 'reconcile')
  if (incident.kind === 'frozen') return { kind: 'execution_pending', rootRunId: input.running.rootRunId }
  const outcome = await adapter.reconcile({
    rootRunId: input.running.rootRunId,
    leafRunId: leaf.leafRunId,
    stepGrantId: leaf.stepGrantId,
    idempotencyKey: input.request.idempotencyKey,
    ...(step.providerQuoteRef === undefined ? {} : { providerQuoteRef: step.providerQuoteRef }),
  }).catch(() => ({ kind: 'reconciliation_pending' as const }))
  if (outcome.kind === 'reconciliation_pending') return { kind: 'execution_pending', rootRunId: input.running.rootRunId }

  const occurredAt = input.now()
  const evidence = record(input.ids, occurredAt, input.running.rootRunId, 'provider_reconciliation_observed', {
    leafRunId: leaf.leafRunId,
    bindingId: leaf.bindingId,
    ...('providerReference' in outcome && outcome.providerReference !== undefined ? { providerReference: outcome.providerReference } : {}),
    evidenceSource: 'provider_adapter_reconcile',
    incidentEpochDigest: input.running.incidentEpochDigest,
  })
  if (outcome.kind === 'effect_not_committed' && step.role === 'primary' && quote !== undefined) {
    const fallback = quote.selectedGraph.steps.find((candidate) => candidate.role === 'fallback')
    const fallbackAdapter = fallback === undefined ? undefined : input.adapters.get(fallback.bindingId)
    const authorization = await input.store.getAuthorization(input.request.authorizationRef)
    if (fallback !== undefined && fallbackAdapter !== undefined && authorization !== undefined) {
      const run = await executeFallbackAfterDefiniteFailure({
        quote,
        rootRunId: input.running.rootRunId,
        primaryLeafRunId: leaf.leafRunId,
        primaryStepGrantId: leaf.stepGrantId,
        primary: step,
        primaryOutcome: outcome,
        fallback,
        fallbackAdapter,
        authorized: input.running.cost.authorized,
        records: [...input.running.records, evidence],
        data: Object.freeze({ ...(input.request.data ?? {}) }),
        store: input.store,
        idempotencyKey: input.request.idempotencyKey,
        requestDigest: createExecutionRequestDigest(input.request, Object.freeze({ ...(input.request.data ?? {}) })),
        authorization,
        ids: input.ids,
        now: input.now,
      })
      await input.store.completeExecution(input.executionScope, run)
      return { kind: 'run_admitted', run }
    }
  }
  const finalRun: RootRunSnapshot = outcome.kind === 'effect_committed'
    ? Object.freeze({
        ...input.running,
        state: 'completed', effectState: 'committed',
        cost: { ...input.running.cost, reserved: null, providerReported: outcome.reportedCost ?? null, settled: null },
        leaves: input.running.leaves.map((candidate) => candidate.leafRunId === leaf.leafRunId
          ? Object.freeze({ ...candidate, state: 'completed', attemptDisposition: 'dispatched', effectState: 'committed', providerReference: outcome.providerReference, outcome: outcome.outcome })
          : candidate),
        records: [...input.running.records, evidence,
          record(input.ids, occurredAt, input.running.rootRunId, 'provider_outcome_reported', { leafRunId: leaf.leafRunId, bindingId: leaf.bindingId, providerReference: outcome.providerReference, incidentEpochDigest: input.running.incidentEpochDigest, ...providerCostRecord(outcome.reportedCost) }),
          record(input.ids, occurredAt, input.running.rootRunId, 'root_run_completed', { incidentEpochDigest: input.running.incidentEpochDigest })],
      })
    : outcome.kind === 'effect_not_committed'
      ? Object.freeze({
          ...input.running,
          state: 'failed', effectState: 'not_committed', cost: { ...input.running.cost, reserved: null, providerReported: null, settled: null },
          leaves: input.running.leaves.map((candidate) => candidate.leafRunId === leaf.leafRunId
            ? Object.freeze({ ...candidate, state: 'failed', attemptDisposition: 'dispatched', effectState: 'not_committed', failureReason: outcome.reason, ...(outcome.providerReference === undefined ? {} : { providerReference: outcome.providerReference }) })
            : candidate),
          records: [...input.running.records, evidence,
            record(input.ids, occurredAt, input.running.rootRunId, 'provider_effect_not_committed', { leafRunId: leaf.leafRunId, bindingId: leaf.bindingId, incidentEpochDigest: input.running.incidentEpochDigest, ...(outcome.providerReference === undefined ? {} : { providerReference: outcome.providerReference }) }),
            record(input.ids, occurredAt, input.running.rootRunId, 'root_run_failed', { incidentEpochDigest: input.running.incidentEpochDigest })],
        })
      : Object.freeze({
          ...input.running,
          state: 'outcome_unknown', effectState: 'unknown', cost: { ...input.running.cost, reserved: step.maximumCost, providerReported: null, settled: null },
          leaves: input.running.leaves.map((candidate) => candidate.leafRunId === leaf.leafRunId
            ? Object.freeze({ ...candidate, state: 'outcome_unknown', attemptDisposition: 'indeterminate', effectState: 'unknown', ...outcome.providerReference === undefined ? {} : { providerReference: outcome.providerReference } })
            : candidate),
          records: [...input.running.records, evidence,
            record(input.ids, occurredAt, input.running.rootRunId, 'provider_outcome_unknown', { leafRunId: leaf.leafRunId, bindingId: leaf.bindingId, incidentEpochDigest: input.running.incidentEpochDigest, ...outcome.providerReference === undefined ? {} : { providerReference: outcome.providerReference } }),
            record(input.ids, occurredAt, input.running.rootRunId, 'root_run_outcome_unknown', { incidentEpochDigest: input.running.incidentEpochDigest })],
        })
  await input.store.completeExecution(input.executionScope, finalRun)
  return { kind: 'run_admitted', run: finalRun }
}

async function resumeAdmittedExecution(input: {
  executionScope: string
  request: ExecuteInput
  running: RootRunSnapshot
  claimedAt: number
  leaf: RootRunSnapshot['leaves'][number]
  store: KernelStore
  adapters: ReadonlyMap<string, CapabilityBindingAdapter>
  incidentControl: IncidentEvaluator
  ids: KernelIdFactory
  now: () => number
}): Promise<ExecuteResult> {
  const quote = await input.store.getQuote(input.running.quoteId)
  if (quote === undefined || quote.quoteDigest !== input.running.quoteDigest) return { kind: 'execution_pending', rootRunId: input.running.rootRunId }
  const stepIncidents = await Promise.all(quote.selectedGraph.steps.map(async (selectedStep) => await input.incidentControl.evaluate({
    ...callerScope(quote.networkId, quote.caller),
    bindingId: selectedStep.bindingId,
    capabilityContractId: selectedStep.capabilityContractId,
  }, 'root_admission')))
  const incidentRefusal = stepIncidents.some((decision) => decision.kind === 'frozen')
    ? 'incident_frozen' as const
    : stepIncidents.every((decision, index) => quote.selectedGraph.steps[index]?.incidentEpochDigest === decision.epochDigest)
      ? undefined
      : 'incident_epoch_stale' as const
  if (incidentRefusal !== undefined) {
    const occurredAt = input.now()
    const run: RootRunSnapshot = Object.freeze({
      ...input.running,
      state: 'failed',
      effectState: 'not_committed',
      cost: { ...input.running.cost, reserved: null, providerReported: null, settled: null },
      leaves: input.running.leaves.map((candidate) => candidate.leafRunId === input.leaf.leafRunId
        ? Object.freeze({ ...candidate, state: 'failed', attemptDisposition: 'not_released', effectState: 'not_committed', failureReason: incidentRefusal })
        : candidate),
      records: [...input.running.records, record(input.ids, occurredAt, input.running.rootRunId, 'root_run_failed', { incidentEpochDigest: input.running.incidentEpochDigest })],
    })
    await input.store.completeExecution(input.executionScope, run)
    return { kind: 'run_admitted', run }
  }
  const step = quote.selectedGraph.steps.find((candidate) => candidate.bindingId === input.leaf.bindingId)
  const adapter = input.adapters.get(input.leaf.bindingId)
  const authorization = await input.store.getAuthorization(input.request.authorizationRef)
  if (step === undefined || adapter === undefined || authorization === undefined) return { kind: 'execution_pending', rootRunId: input.running.rootRunId }
  const data = Object.freeze({ ...(input.request.data ?? {}) })
  const stepData = projectDataForStep(data, step.dataFields)
  const grant = grantForStep({
    quote, step, rootRunId: input.running.rootRunId, leafRunId: input.leaf.leafRunId,
    stepGrantId: input.leaf.stepGrantId, requestDigest: createExecutionRequestDigest(input.request, data),
    disclosedDataFields: Object.keys(stepData), attempt: step.role === 'primary' ? 1 : 2,
    issuedAt: input.claimedAt, expiresAt: authorization.expiresAt,
  })
  const disclosureGrant = disclosureGrantForStep({ authorization, step, stepGrant: grant, data: stepData })
  const released = releasedRun({
    run: input.running, grant, ...(disclosureGrant === undefined ? {} : { disclosureGrant }),
    ...(input.request.executionPurpose === 'incident_canary' ? { canaryRecoveryGrantId: input.request.canaryRecoveryGrantId } : {}),
    ids: input.ids, occurredAt: input.now(),
  })
  const release = await input.store.authorizeProviderRelease({
    grant,
    ...(disclosureGrant === undefined ? {} : { disclosureGrant }),
    releasedAt: input.now(),
    run: released,
    ...(input.request.executionPurpose === 'incident_canary' ? { canaryRecoveryGrantId: input.request.canaryRecoveryGrantId } : {}),
  })
  if (release === 'cancelled') {
    const run = cancelledRun({ quote, rootRunId: input.running.rootRunId, authorized: input.running.cost.authorized, budgetAuthorityRef: authorization.budgetAuthorityRef, budgetMaximumGrossMinor: authorization.budgetMaximumGrossMinor, ids: input.ids, occurredAt: input.now() })
    await input.store.completeExecution(input.executionScope, run)
    return { kind: 'run_admitted', run }
  }
  if (release !== 'released' && release !== 'already_released') return { kind: 'execution_pending', rootRunId: input.running.rootRunId }

  const outcome = await adapter.execute({
    rootRunId: input.running.rootRunId,
    leafRunId: input.leaf.leafRunId,
    stepGrantId: input.leaf.stepGrantId,
    idempotencyKey: input.request.idempotencyKey,
    ...(step.providerQuoteRef === undefined ? {} : { providerQuoteRef: step.providerQuoteRef }),
    data: stepData,
  }).catch(() => ({ kind: 'outcome_unknown' as const }))
  if (disclosureGrant !== undefined && 'dataReleaseDisposition' in outcome && outcome.dataReleaseDisposition === 'released') await input.store.resolveDisclosureAttempt(disclosureGrant.disclosureGrantId, 'released', input.now())
  const occurredAt = input.now()
  if (outcome.kind === 'effect_not_committed') {
    const fallback = quote.selectedGraph.steps.find((candidate) => candidate.role === 'fallback')
    const fallbackAdapter = fallback === undefined ? undefined : input.adapters.get(fallback.bindingId)
    if (fallback !== undefined && fallbackAdapter !== undefined) {
      const run = await executeFallbackAfterDefiniteFailure({
        quote, rootRunId: input.running.rootRunId, primaryLeafRunId: input.leaf.leafRunId,
        primaryStepGrantId: input.leaf.stepGrantId, primary: step, primaryOutcome: outcome,
        fallback, fallbackAdapter, store: input.store, authorized: input.running.cost.authorized,
        records: [...released.records], data, idempotencyKey: input.request.idempotencyKey,
        requestDigest: createExecutionRequestDigest(input.request, data), authorization,
        ids: input.ids, now: input.now,
      })
      await input.store.completeExecution(input.executionScope, run)
      return { kind: 'run_admitted', run }
    }
  }
  const run = outcome.kind === 'effect_committed'
    ? completedRun({ quote, rootRunId: input.running.rootRunId, leafRunId: input.leaf.leafRunId, stepGrantId: input.leaf.stepGrantId, authorized: input.running.cost.authorized, providerReference: outcome.providerReference, outcome: outcome.outcome, reportedCost: outcome.reportedCost, records: [...released.records], ids: input.ids, occurredAt })
    : outcome.kind === 'effect_not_committed'
      ? failedRun({ quote, rootRunId: input.running.rootRunId, leafRunId: input.leaf.leafRunId, stepGrantId: input.leaf.stepGrantId, authorized: input.running.cost.authorized, reason: outcome.reason, ...(outcome.providerReference === undefined ? {} : { providerReference: outcome.providerReference }), records: [...released.records], ids: input.ids, occurredAt })
      : unknownRun({ quote, rootRunId: input.running.rootRunId, leafRunId: input.leaf.leafRunId, stepGrantId: input.leaf.stepGrantId, authorized: input.running.cost.authorized, ...('providerReference' in outcome && outcome.providerReference !== undefined ? { providerReference: outcome.providerReference } : {}), records: [...released.records], ids: input.ids, occurredAt })
  await input.store.completeExecution(input.executionScope, run)
  return { kind: 'run_admitted', run }
}

function admittedRun(input: {
  quote: RouteQuote; rootRunId: string; leafRunId: string; stepGrantId: string
  authorized: Money; budgetAuthorityRef: string; budgetMaximumGrossMinor: number; ids: KernelIdFactory; occurredAt: number
}): RootRunSnapshot {
  const primary = input.quote.selectedGraph.steps.at(0)
  if (primary === undefined) throw new Error('route_quote_primary_missing')
  return Object.freeze({
    rootRunId: input.rootRunId, quoteId: input.quote.quoteId, quoteDigest: input.quote.quoteDigest, incidentEpochDigest: input.quote.incidentEpochDigest,
    networkId: input.quote.networkId, executionMode: input.quote.executionMode, caller: input.quote.caller,
    state: 'running', enforcement: 'enforced', effectState: 'not_started',
    cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost),
    leaves: [Object.freeze({
      leafRunId: input.leafRunId, stepGrantId: input.stepGrantId, bindingId: primary.bindingId,
      nodeId: primary.nodeId, capabilityContractId: primary.capabilityContractId,
      state: 'pending', attemptDisposition: 'not_released', effectState: 'not_started', enforcement: 'enforced',
    })],
    records: [record(input.ids, input.occurredAt, input.rootRunId, 'root_run_admitted', {
      budgetAuthorityRef: input.budgetAuthorityRef,
      budgetMaximumGrossMinor: input.budgetMaximumGrossMinor,
      spendReservationMinor: input.quote.selectedGraph.maximumCost.amountMinor,
      budgetCurrency: input.quote.selectedGraph.maximumCost.currency,
      incidentEpochDigest: input.quote.incidentEpochDigest,
    })],
  })
}

function incidentFrozenRun(input: {
  run: RootRunSnapshot
  decision: Extract<IncidentEvaluation, { kind: 'frozen' }>
  ids: KernelIdFactory
  occurredAt: number
}): RootRunSnapshot {
  return Object.freeze({
    ...input.run,
    state: 'incident_frozen',
    effectState: 'not_started',
    cost: runCost(input.run.cost.authorized, input.run.cost.quotedMaximum),
    leaves: Object.freeze(input.run.leaves.map((leaf) => Object.freeze({
      ...leaf,
      state: 'incident_frozen',
      attemptDisposition: 'not_released',
      effectState: 'not_started',
    }))),
    records: Object.freeze([...input.run.records, record(
      input.ids,
      input.occurredAt,
      input.run.rootRunId,
      'incident_freeze_observed',
      {
        incidentId: input.decision.incidentId,
        freezeOrderId: input.decision.freezeOrderId,
        incidentEpochDigest: input.decision.epochDigest,
      },
    )]),
  })
}

function incidentEpochStaleRun(input: {
  run: RootRunSnapshot
  epochDigest: string
  ids: KernelIdFactory
  occurredAt: number
}): RootRunSnapshot {
  return Object.freeze({
    ...input.run,
    state: 'incident_frozen',
    effectState: 'not_started',
    cost: runCost(input.run.cost.authorized, input.run.cost.quotedMaximum),
    leaves: Object.freeze(input.run.leaves.map((leaf) => Object.freeze({
      ...leaf, state: 'incident_frozen', attemptDisposition: 'not_released', effectState: 'not_started',
    }))),
    records: Object.freeze([...input.run.records, record(
      input.ids, input.occurredAt, input.run.rootRunId, 'incident_epoch_stale_observed', {
        incidentEpochDigest: input.epochDigest,
      },
    )]),
  })
}

function releasedRun(input: {
  run: RootRunSnapshot; grant: StepGrant; disclosureGrant?: DisclosureGrant; canaryRecoveryGrantId?: string
  ids: KernelIdFactory; occurredAt: number
}): RootRunSnapshot {
  const leaf = input.run.leaves.at(0)
  if (leaf === undefined) throw new Error('root_run_primary_leaf_missing')
  return Object.freeze({
    ...input.run,
    effectState: 'released',
    cost: { ...input.run.cost, reserved: input.grant.maximumCost },
    leaves: [Object.freeze({ ...leaf, state: 'released', attemptDisposition: 'released', effectState: 'released' })],
    records: [...input.run.records,
      record(input.ids, input.occurredAt, input.run.rootRunId, 'step_grant_consumed', stepGrantRecordDetails(input.grant)),
      ...(input.canaryRecoveryGrantId === undefined ? [] : [record(
        input.ids, input.occurredAt, input.run.rootRunId, 'incident_canary_recovery_consumed', {
          leafRunId: leaf.leafRunId, bindingId: leaf.bindingId, recoveryGrantId: input.canaryRecoveryGrantId,
          incidentEpochDigest: input.run.incidentEpochDigest,
        },
      )]),
      ...(input.disclosureGrant === undefined ? [] : [record(input.ids, input.occurredAt, input.run.rootRunId, 'disclosure_grant_consumed', disclosureGrantRecordDetails(input.disclosureGrant))]),
      record(input.ids, input.occurredAt, input.run.rootRunId, 'provider_attempt_released', {
        leafRunId: leaf.leafRunId, bindingId: leaf.bindingId, disclosedDataFields: [...input.grant.disclosedDataFields],
        stepGrantDigest: input.grant.grantDigest, incidentEpochDigest: input.run.incidentEpochDigest,
      })],
  })
}

function cancelledRun(input: { quote: RouteQuote; rootRunId: string; authorized: Money; budgetAuthorityRef: string; budgetMaximumGrossMinor: number; ids: KernelIdFactory; occurredAt: number }): RootRunSnapshot {
  return Object.freeze({
    rootRunId: input.rootRunId, quoteId: input.quote.quoteId, quoteDigest: input.quote.quoteDigest, incidentEpochDigest: input.quote.incidentEpochDigest,
    networkId: input.quote.networkId, executionMode: input.quote.executionMode, caller: input.quote.caller,
    state: 'cancelled', enforcement: 'enforced', effectState: 'not_committed',
    cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost), leaves: [],
    records: [record(input.ids, input.occurredAt, input.rootRunId, 'root_run_admitted', {
      budgetAuthorityRef: input.budgetAuthorityRef, budgetMaximumGrossMinor: input.budgetMaximumGrossMinor,
      spendReservationMinor: input.quote.selectedGraph.maximumCost.amountMinor, budgetCurrency: input.quote.selectedGraph.maximumCost.currency,
      incidentEpochDigest: input.quote.incidentEpochDigest,
    }), record(input.ids, input.occurredAt, input.rootRunId, 'cancellation_requested', { incidentEpochDigest: input.quote.incidentEpochDigest }), record(input.ids, input.occurredAt, input.rootRunId, 'root_run_cancelled', { incidentEpochDigest: input.quote.incidentEpochDigest })],
  } satisfies RootRunSnapshot)
}

function failedRun(input: {
  quote: RouteQuote; rootRunId: string; leafRunId: string; stepGrantId: string; authorized: Money; reason: string; providerReference?: string
  records: ProtocolRecord[]; ids: KernelIdFactory; occurredAt: number
}): RootRunSnapshot {
  const details = { leafRunId: input.leafRunId, bindingId: input.quote.selectedGraph.bindingId, incidentEpochDigest: input.quote.incidentEpochDigest, ...(input.providerReference === undefined ? {} : { providerReference: input.providerReference }) }
  const snapshot = {
    rootRunId: input.rootRunId, quoteId: input.quote.quoteId, quoteDigest: input.quote.quoteDigest, incidentEpochDigest: input.quote.incidentEpochDigest,
    networkId: input.quote.networkId, executionMode: input.quote.executionMode, caller: input.quote.caller,
    state: 'failed', enforcement: 'enforced', effectState: 'not_committed',
    cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost),
    leaves: [{ leafRunId: input.leafRunId, stepGrantId: input.stepGrantId, bindingId: input.quote.selectedGraph.bindingId, nodeId: input.quote.selectedGraph.nodeId, capabilityContractId: input.quote.selectedGraph.capabilityContractId, state: 'failed', attemptDisposition: 'dispatched', effectState: 'not_committed', enforcement: 'enforced', failureReason: input.reason, ...(input.providerReference === undefined ? {} : { providerReference: input.providerReference }) }],
    records: [...input.records, record(input.ids, input.occurredAt, input.rootRunId, 'provider_effect_not_committed', details), record(input.ids, input.occurredAt, input.rootRunId, 'root_run_failed', { incidentEpochDigest: input.quote.incidentEpochDigest })],
  } satisfies RootRunSnapshot
  return Object.freeze(snapshot)
}

async function executeFallbackAfterDefiniteFailure(input: {
  quote: RouteQuote
  rootRunId: string
  primaryLeafRunId: string
  primaryStepGrantId: string
  primary: CandidateGraphStepQuote
  primaryOutcome: Extract<Awaited<ReturnType<CapabilityBindingAdapter['execute']>>, { kind: 'effect_not_committed' }>
  fallback: CandidateGraphStepQuote
  fallbackAdapter: CapabilityBindingAdapter
  store: KernelStore
  authorized: Money
  records: ProtocolRecord[]
  data: Readonly<Record<string, string>>
  idempotencyKey: string
  requestDigest: string
  authorization: RouteAuthorization
  ids: KernelIdFactory
  now: () => number
}): Promise<RootRunSnapshot> {
  const occurredAt = input.now()
  const fallbackData = projectDataForStep(input.data, input.fallback.dataFields)
  const fallbackLeafRunId = input.ids.next('leaf-run')
  const fallbackStepGrantId = input.ids.next('step-grant')
  const fallbackGrant = grantForStep({
    quote: input.quote, step: input.fallback, rootRunId: input.rootRunId,
    leafRunId: fallbackLeafRunId, stepGrantId: fallbackStepGrantId,
    requestDigest: input.requestDigest, disclosedDataFields: Object.keys(fallbackData),
    attempt: 2, issuedAt: occurredAt, expiresAt: input.authorization.expiresAt,
  })
  const fallbackDisclosureGrant = disclosureGrantForStep({ authorization: input.authorization, step: input.fallback, stepGrant: fallbackGrant, data: fallbackData })
  const primaryDetails = {
    leafRunId: input.primaryLeafRunId,
    bindingId: input.primary.bindingId,
    incidentEpochDigest: input.primary.incidentEpochDigest ?? input.quote.incidentEpochDigest,
    ...(input.primaryOutcome.providerReference === undefined ? {} : { providerReference: input.primaryOutcome.providerReference }),
  }
  const primaryLeaf = Object.freeze({
    leafRunId: input.primaryLeafRunId,
    stepGrantId: input.primaryStepGrantId,
    bindingId: input.primary.bindingId,
    nodeId: input.primary.nodeId,
    capabilityContractId: input.primary.capabilityContractId,
    state: 'failed' as const,
    attemptDisposition: 'dispatched' as const,
    effectState: 'not_committed' as const,
    enforcement: 'enforced' as const,
    failureReason: input.primaryOutcome.reason,
    ...(input.primaryOutcome.providerReference === undefined ? {} : { providerReference: input.primaryOutcome.providerReference }),
  })
  const base = {
    rootRunId: input.rootRunId,
    quoteId: input.quote.quoteId,
    quoteDigest: input.quote.quoteDigest,
    incidentEpochDigest: input.quote.incidentEpochDigest,
    networkId: input.quote.networkId,
    executionMode: input.quote.executionMode,
    caller: input.quote.caller,
    enforcement: 'enforced' as const,
  }
  const records = [
    ...input.records,
    record(input.ids, occurredAt, input.rootRunId, 'provider_effect_not_committed', primaryDetails),
    record(input.ids, occurredAt, input.rootRunId, 'fallback_released', { leafRunId: fallbackLeafRunId, bindingId: input.fallback.bindingId, incidentEpochDigest: fallbackGrant.incidentEpochDigest }),
    record(input.ids, occurredAt, input.rootRunId, 'step_grant_consumed', stepGrantRecordDetails(fallbackGrant)),
    ...(fallbackDisclosureGrant === undefined ? [] : [record(input.ids, occurredAt, input.rootRunId, 'disclosure_grant_consumed', disclosureGrantRecordDetails(fallbackDisclosureGrant))]),
    record(input.ids, occurredAt, input.rootRunId, 'provider_attempt_released', {
      leafRunId: fallbackLeafRunId,
      bindingId: input.fallback.bindingId,
      disclosedDataFields: Object.keys(fallbackData).sort(),
      stepGrantDigest: fallbackGrant.grantDigest,
      incidentEpochDigest: fallbackGrant.incidentEpochDigest,
    }),
  ]
  const fallbackReleasedRun: RootRunSnapshot = Object.freeze({
    ...base,
    state: 'running',
    effectState: 'released',
    cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost, input.fallback.maximumCost),
    leaves: [primaryLeaf, Object.freeze({
      leafRunId: fallbackLeafRunId, stepGrantId: fallbackStepGrantId, bindingId: input.fallback.bindingId,
      nodeId: input.fallback.nodeId, capabilityContractId: input.fallback.capabilityContractId,
      state: 'released', attemptDisposition: 'released', effectState: 'released', enforcement: 'enforced',
    })],
    records,
  })
  const release = await input.store.authorizeProviderRelease({
    grant: fallbackGrant,
    ...(fallbackDisclosureGrant === undefined ? {} : { disclosureGrant: fallbackDisclosureGrant }),
    releasedAt: occurredAt,
    run: fallbackReleasedRun,
  })
  if (release !== 'released' && release !== 'already_released') {
    return Object.freeze({
      rootRunId: input.rootRunId,
      quoteId: input.quote.quoteId,
      quoteDigest: input.quote.quoteDigest,
      incidentEpochDigest: input.quote.incidentEpochDigest,
      networkId: input.quote.networkId,
      executionMode: input.quote.executionMode,
      caller: input.quote.caller,
      state: 'failed',
      enforcement: 'enforced',
      effectState: 'not_committed',
      cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost),
      leaves: [Object.freeze({
        leafRunId: input.primaryLeafRunId, stepGrantId: input.primaryStepGrantId, bindingId: input.primary.bindingId, nodeId: input.primary.nodeId,
        capabilityContractId: input.primary.capabilityContractId, state: 'failed', attemptDisposition: 'dispatched',
        effectState: 'not_committed', enforcement: 'enforced', failureReason: input.primaryOutcome.reason,
        ...(input.primaryOutcome.providerReference === undefined ? {} : { providerReference: input.primaryOutcome.providerReference }),
      })],
      records: [...input.records,
        record(input.ids, occurredAt, input.rootRunId, 'provider_effect_not_committed', primaryDetails),
        record(input.ids, occurredAt, input.rootRunId, 'fallback_release_refused', { leafRunId: fallbackLeafRunId, bindingId: input.fallback.bindingId, incidentEpochDigest: fallbackGrant.incidentEpochDigest }),
        record(input.ids, occurredAt, input.rootRunId, 'root_run_failed', { incidentEpochDigest: input.quote.incidentEpochDigest })],
    })
  }
  const outcome = await input.fallbackAdapter.execute({
    rootRunId: input.rootRunId,
    leafRunId: fallbackLeafRunId,
    stepGrantId: fallbackStepGrantId,
    idempotencyKey: `${input.idempotencyKey}:fallback:${input.fallback.bindingId}`,
    ...(input.fallback.providerQuoteRef === undefined ? {} : { providerQuoteRef: input.fallback.providerQuoteRef }),
    data: fallbackData,
  }).catch(() => ({ kind: 'outcome_unknown' as const }))
  if (fallbackDisclosureGrant !== undefined && 'dataReleaseDisposition' in outcome && outcome.dataReleaseDisposition === 'released') await input.store.resolveDisclosureAttempt(fallbackDisclosureGrant.disclosureGrantId, 'released', input.now())
  if (outcome.kind === 'effect_committed') {
    return Object.freeze({
      ...base,
      state: 'completed',
      effectState: 'committed',
      cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost, null, outcome.reportedCost ?? null),
      leaves: [primaryLeaf, Object.freeze({
        leafRunId: fallbackLeafRunId, stepGrantId: fallbackStepGrantId, bindingId: input.fallback.bindingId, nodeId: input.fallback.nodeId,
        capabilityContractId: input.fallback.capabilityContractId, state: 'completed', attemptDisposition: 'dispatched',
        effectState: 'committed', enforcement: 'enforced', providerReference: outcome.providerReference, outcome: outcome.outcome,
      })],
      records: [...records,
        record(input.ids, occurredAt, input.rootRunId, 'provider_outcome_reported', { leafRunId: fallbackLeafRunId, bindingId: input.fallback.bindingId, providerReference: outcome.providerReference, incidentEpochDigest: fallbackGrant.incidentEpochDigest, ...providerCostRecord(outcome.reportedCost) }),
        record(input.ids, occurredAt, input.rootRunId, 'root_run_completed', { incidentEpochDigest: input.quote.incidentEpochDigest })],
    })
  }

  if (outcome.kind === 'effect_not_committed') {
    return Object.freeze({
      ...base,
      state: 'failed',
      effectState: 'not_committed',
      cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost),
      leaves: [primaryLeaf, Object.freeze({
        leafRunId: fallbackLeafRunId, stepGrantId: fallbackStepGrantId, bindingId: input.fallback.bindingId, nodeId: input.fallback.nodeId,
        capabilityContractId: input.fallback.capabilityContractId, state: 'failed', attemptDisposition: 'dispatched',
        effectState: 'not_committed', enforcement: 'enforced', failureReason: outcome.reason,
        ...(outcome.providerReference === undefined ? {} : { providerReference: outcome.providerReference }),
      })],
      records: [...records,
        record(input.ids, occurredAt, input.rootRunId, 'provider_effect_not_committed', { leafRunId: fallbackLeafRunId, bindingId: input.fallback.bindingId, incidentEpochDigest: fallbackGrant.incidentEpochDigest, ...(outcome.providerReference === undefined ? {} : { providerReference: outcome.providerReference }) }),
        record(input.ids, occurredAt, input.rootRunId, 'root_run_failed', { incidentEpochDigest: input.quote.incidentEpochDigest })],
    })
  }

  return Object.freeze({
    ...base,
    state: 'outcome_unknown',
    effectState: 'unknown',
    cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost, input.fallback.maximumCost),
    leaves: [primaryLeaf, Object.freeze({
      leafRunId: fallbackLeafRunId, stepGrantId: fallbackStepGrantId, bindingId: input.fallback.bindingId, nodeId: input.fallback.nodeId,
      capabilityContractId: input.fallback.capabilityContractId, state: 'outcome_unknown', attemptDisposition: 'indeterminate',
      effectState: 'unknown', enforcement: 'enforced', ...('providerReference' in outcome && outcome.providerReference !== undefined ? { providerReference: outcome.providerReference } : {}),
    })],
    records: [...records,
      record(input.ids, occurredAt, input.rootRunId, 'provider_outcome_unknown', { leafRunId: fallbackLeafRunId, bindingId: input.fallback.bindingId, incidentEpochDigest: fallbackGrant.incidentEpochDigest, ...('providerReference' in outcome && outcome.providerReference !== undefined ? { providerReference: outcome.providerReference } : {}) }),
      record(input.ids, occurredAt, input.rootRunId, 'root_run_outcome_unknown', { incidentEpochDigest: input.quote.incidentEpochDigest })],
  })
}

function projectDataForStep(
  data: Readonly<Record<string, string>>,
  declaredFields: readonly string[],
): Readonly<Record<string, string>> {
  const fields = new Set(declaredFields)
  return Object.freeze(Object.fromEntries(
    Object.entries(data).filter(([field]) => fields.has(field)),
  ))
}

export function createExecutionRequestDigest(
  request: Pick<ExecuteInput, 'quoteId' | 'quoteDigest' | 'authorizationRef' | 'executionPurpose' | 'canaryRecoveryGrantId'>,
  data: Readonly<Record<string, string>>,
): string {
  return canonicalAuthorityDigest({
    quoteId: request.quoteId,
    quoteDigest: request.quoteDigest,
    authorizationRef: request.authorizationRef,
    ...(request.executionPurpose === undefined ? {} : { executionPurpose: request.executionPurpose }),
    ...(request.canaryRecoveryGrantId === undefined ? {} : { canaryRecoveryGrantId: request.canaryRecoveryGrantId }),
    data,
  })
}

function grantForStep(input: Readonly<{
  quote: RouteQuote
  step: CandidateGraphStepQuote
  rootRunId: string
  leafRunId: string
  stepGrantId: string
  requestDigest: string
  disclosedDataFields: readonly string[]
  attempt: number
  issuedAt: number
  expiresAt: number
}>): StepGrant {
  return createStepGrant({
    stepGrantId: input.stepGrantId,
    rootRunId: input.rootRunId,
    leafRunId: input.leafRunId,
    quoteId: input.quote.quoteId,
    quoteDigest: input.quote.quoteDigest,
    incidentEpochDigest: input.step.incidentEpochDigest ?? input.quote.incidentEpochDigest,
    requestDigest: input.requestDigest,
    bindingId: input.step.bindingId,
    nodeId: input.step.nodeId,
    capabilityContractId: input.step.capabilityContractId,
    maximumCost: input.step.maximumCost,
    disclosedDataFields: input.disclosedDataFields,
    attempt: input.attempt,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    enforcementPoint: 'provider_release',
  })
}

function disclosureGrantForStep(input: Readonly<{
  authorization: RouteAuthorization
  step: CandidateGraphStepQuote
  stepGrant: StepGrant
  data: Readonly<Record<string, string>>
}>): DisclosureGrant | undefined {
  const fields = Object.keys(input.data).sort()
  if (fields.length === 0) return undefined
  return createDisclosureGrant({
    disclosureGrantId: `disclosure-grant:${input.stepGrant.stepGrantId}`,
    dataAuthorizationBudgetRef: input.authorization.dataAuthorizationBudgetRef,
    rootRunId: input.stepGrant.rootRunId,
    leafRunId: input.stepGrant.leafRunId,
    stepGrantId: input.stepGrant.stepGrantId,
    quoteId: input.stepGrant.quoteId,
    quoteDigest: input.stepGrant.quoteDigest,
    requestDigest: input.stepGrant.requestDigest,
    recipientBindingId: input.step.bindingId,
    purpose: input.step.capabilityContractId,
    fields,
    projectionDigest: canonicalAuthorityDigest(input.data),
    attempt: input.stepGrant.attempt,
    issuedAt: input.stepGrant.issuedAt,
    expiresAt: input.stepGrant.expiresAt,
    incidentEpochDigest: input.stepGrant.incidentEpochDigest,
  })
}

function stepGrantRecordDetails(grant: StepGrant) {
  return {
    leafRunId: grant.leafRunId,
    bindingId: grant.bindingId,
    stepGrantDigest: grant.grantDigest,
    maximumCost: grant.maximumCost,
    disclosedDataFields: grant.disclosedDataFields,
    attempt: grant.attempt,
    expiresAt: grant.expiresAt,
    enforcementPoint: grant.enforcementPoint,
    incidentEpochDigest: grant.incidentEpochDigest,
  }
}

function disclosureGrantRecordDetails(grant: DisclosureGrant) {
  return {
    leafRunId: grant.leafRunId,
    bindingId: grant.recipientBindingId,
    disclosedDataFields: grant.fields,
    dataAuthorizationBudgetRef: grant.dataAuthorizationBudgetRef,
    disclosureGrantId: grant.disclosureGrantId,
    disclosureGrantDigest: grant.disclosureGrantDigest,
    disclosureRecipientBindingId: grant.recipientBindingId,
    disclosurePurpose: grant.purpose,
    disclosureDisposition: 'indeterminate' as const,
    enforcementPoint: 'data_release' as const,
    attempt: grant.attempt,
    expiresAt: grant.expiresAt,
    incidentEpochDigest: grant.incidentEpochDigest,
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

function authorizationRefusal(
  quote: RouteQuote,
  authorization: RouteAuthorization | undefined,
  caller: KernelCaller,
  now: number,
): string | undefined {
  if (quote.expiresAt <= now) return 'quote_expired'
  if (authorization === undefined) return 'authorization_not_found'
  if (authorization.consumedAt !== undefined) return 'authorization_consumed'
  if (authorization.quoteId !== quote.quoteId || authorization.quoteDigest !== quote.quoteDigest) return 'authorization_quote_mismatch'
  if (authorization.principalId !== caller.principalId || authorization.agentId !== caller.agentId) return 'authorization_caller_mismatch'
  if (!sameCaller(quote.caller, caller)) return 'quote_caller_mismatch'
  if (authorization.expiresAt <= now) return 'authorization_expired'
  if (authorization.currency !== quote.selectedGraph.maximumCost.currency) return 'authorization_currency_mismatch'
  if (authorization.maximumSpendMinor < quote.selectedGraph.maximumCost.amountMinor) return 'authorization_spend_exceeded'
  return undefined
}

function completedRun(input: {
  quote: RouteQuote
  rootRunId: string
  leafRunId: string
  stepGrantId: string
  authorized: Money
  providerReference: string
  outcome: Readonly<Record<string, string>>
  reportedCost: Money | undefined
  records: ProtocolRecord[]
  ids: KernelIdFactory
  occurredAt: number
}): RootRunSnapshot {
  const records = [
    ...input.records,
    record(input.ids, input.occurredAt, input.rootRunId, 'provider_outcome_reported', {
      leafRunId: input.leafRunId,
      bindingId: input.quote.selectedGraph.bindingId,
      providerReference: input.providerReference,
      incidentEpochDigest: input.quote.incidentEpochDigest,
      ...providerCostRecord(input.reportedCost),
    }),
    record(input.ids, input.occurredAt, input.rootRunId, 'root_run_completed', { incidentEpochDigest: input.quote.incidentEpochDigest }),
  ]
  const snapshot = {
    rootRunId: input.rootRunId,
    quoteId: input.quote.quoteId,
    quoteDigest: input.quote.quoteDigest,
    incidentEpochDigest: input.quote.incidentEpochDigest,
    networkId: input.quote.networkId,
    executionMode: input.quote.executionMode,
    caller: input.quote.caller,
    state: 'completed',
    enforcement: 'enforced',
    effectState: 'committed',
    cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost, null, input.reportedCost ?? null),
    leaves: [{
      leafRunId: input.leafRunId,
      stepGrantId: input.stepGrantId,
      bindingId: input.quote.selectedGraph.bindingId,
      nodeId: input.quote.selectedGraph.nodeId,
      capabilityContractId: input.quote.selectedGraph.capabilityContractId,
      state: 'completed',
      attemptDisposition: 'dispatched',
      effectState: 'committed',
      enforcement: 'enforced',
      providerReference: input.providerReference,
      outcome: input.outcome,
    }],
    records,
  } satisfies RootRunSnapshot
  return Object.freeze(snapshot)
}

function unknownRun(input: {
  quote: RouteQuote
  rootRunId: string
  leafRunId: string
  stepGrantId: string
  authorized: Money
  providerReference?: string
  records: ProtocolRecord[]
  ids: KernelIdFactory
  occurredAt: number
}): RootRunSnapshot {
  const records = [
    ...input.records,
    record(input.ids, input.occurredAt, input.rootRunId, 'provider_outcome_unknown', {
      leafRunId: input.leafRunId,
      bindingId: input.quote.selectedGraph.bindingId,
      ...(input.providerReference === undefined ? {} : { providerReference: input.providerReference }),
      incidentEpochDigest: input.quote.incidentEpochDigest,
    }),
    record(input.ids, input.occurredAt, input.rootRunId, 'root_run_outcome_unknown', { incidentEpochDigest: input.quote.incidentEpochDigest }),
  ]
  const snapshot = {
    rootRunId: input.rootRunId,
    quoteId: input.quote.quoteId,
    quoteDigest: input.quote.quoteDigest,
    incidentEpochDigest: input.quote.incidentEpochDigest,
    networkId: input.quote.networkId,
    executionMode: input.quote.executionMode,
    caller: input.quote.caller,
    state: 'outcome_unknown',
    enforcement: 'enforced',
    effectState: 'unknown',
    cost: runCost(input.authorized, input.quote.selectedGraph.maximumCost, input.quote.selectedGraph.maximumCost),
    leaves: [{
      leafRunId: input.leafRunId,
      stepGrantId: input.stepGrantId,
      bindingId: input.quote.selectedGraph.bindingId,
      nodeId: input.quote.selectedGraph.nodeId,
      capabilityContractId: input.quote.selectedGraph.capabilityContractId,
      state: 'outcome_unknown',
      attemptDisposition: 'indeterminate',
      effectState: 'unknown',
      enforcement: 'enforced',
      ...(input.providerReference === undefined ? {} : { providerReference: input.providerReference }),
    }],
    records,
  } satisfies RootRunSnapshot
  return Object.freeze(snapshot)
}

function record(
  ids: KernelIdFactory,
  occurredAt: number,
  rootRunId: string,
  type: ProtocolRecord['type'],
  details: Pick<ProtocolRecord,
    | 'leafRunId' | 'bindingId' | 'providerReference' | 'evidenceSource' | 'disclosedDataFields'
    | 'stepGrantDigest' | 'maximumCost' | 'attempt' | 'expiresAt' | 'enforcementPoint'
    | 'reportedCost' | 'financialObservation'
    | 'budgetAuthorityRef' | 'budgetMaximumGrossMinor' | 'spendReservationMinor' | 'budgetCurrency'
    | 'dataAuthorizationBudgetRef' | 'disclosureGrantId' | 'disclosureGrantDigest'
    | 'disclosureRecipientBindingId' | 'disclosurePurpose' | 'disclosureDisposition'
    | 'cancellationRequestId' | 'cancellationDisposition' | 'cancellationReason'
    | 'incidentId' | 'freezeOrderId' | 'recoveryGrantId' | 'incidentEpochDigest'
  >,
): ProtocolRecord {
  return Object.freeze({ recordId: ids.next('protocol-record'), type, rootRunId, occurredAt, ...details })
}

function money(currency: string, amountMinor: number): Money {
  return Object.freeze({ currency, amountMinor })
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

function runCost(
  authorized: Money,
  quotedMaximum: Money,
  reserved: Money | null = null,
  providerReported: Money | null = null,
) {
  return Object.freeze({ authorized, quotedMaximum, reserved, providerReported, settled: null })
}

function providerCostRecord(reportedCost: Money | undefined) {
  return reportedCost === undefined
    ? {}
    : { reportedCost, financialObservation: 'provider_reported' as const }
}

function sameCaller(left: KernelCaller, right: KernelCaller): boolean {
  return left.agentId === right.agentId && left.principalId === right.principalId
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

function callerScope(networkId: string, caller: KernelCaller): IncidentScope {
  return { networkId, principalId: caller.principalId, agentId: caller.agentId }
}

function bindingScope(binding: CapabilityBindingAdapter['binding'], caller: KernelCaller): IncidentScope {
  return {
    ...callerScope(binding.networkId, caller), bindingId: binding.bindingId,
    capabilityContractId: binding.capabilityContractId,
  }
}

function graphScope(networkId: string, caller: KernelCaller, graph: CandidateGraphQuote): IncidentScope {
  return {
    ...callerScope(networkId, caller), bindingId: graph.bindingId,
    capabilityContractId: graph.capabilityContractId,
  }
}

function runIncidentScope(run: RootRunSnapshot, selectedLeaf = run.leaves.at(0)): IncidentScope {
  return {
    ...callerScope(run.networkId, run.caller),
    ...(selectedLeaf === undefined ? {} : {
      bindingId: selectedLeaf.bindingId,
      capabilityContractId: selectedLeaf.capabilityContractId,
    }),
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
