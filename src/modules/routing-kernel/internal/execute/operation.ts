import type {
  CandidateGraphStepQuote,
  CapabilityBindingAdapter,
  KernelIdFactory,
  ProtocolRecord,
  RootRunSnapshot,
  RouteAuthorization,
  RouteQuote,
} from '../model'
import type { IncidentEvaluator, IncidentScope } from '../../incident-control'
import type { KernelStore } from '../store'
import type { ExecuteInput, ExecuteResult } from '../kernel'
import { executeFallbackAfterDefiniteFailure } from './fallback'
import {
  authorizationRefusal,
  createExecutionRequestDigest,
  disclosureGrantForStep,
  grantForStep,
  projectDataForStep,
} from './grants'
import {
  admittedRun,
  cancelledRun,
  completedRun,
  failedRun,
  incidentEpochStaleRun,
  incidentFrozenRun,
  money,
  providerCostRecord,
  record,
  releasedRun,
  unknownRun,
} from '../shared/run-snapshots'
import {
  callerScope,
  graphScope,
  runIncidentScope,
} from '../shared/incident-scope'

const EXECUTION_RECOVERY_LEASE_MS = 30_000

export type CreateExecuteOperationInput = Readonly<{
  store: KernelStore
  adapters: ReadonlyMap<string, CapabilityBindingAdapter>
  incidentControl: IncidentEvaluator
  ids: KernelIdFactory
  now: () => number
  lifecycle?: Readonly<{
    afterRootAdmission?: (checkpoint: Readonly<{ rootRunId: string; leafRunId: string; bindingId: string }>) => Promise<void>
    afterProviderOutcome?: (checkpoint: Readonly<{ rootRunId: string; leafRunId: string; bindingId: string }>) => Promise<void>
  }>
  validateSelectedStepEpochs: (
    quote: RouteQuote,
    action: Parameters<IncidentEvaluator['evaluate']>[1],
  ) => Promise<'allowed' | 'frozen' | 'stale'>
}>

export function createExecuteOperation(input: CreateExecuteOperationInput): (request: ExecuteInput) => Promise<ExecuteResult> {
  const { store, adapters, incidentControl, ids, now, lifecycle, validateSelectedStepEpochs } = input

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
      recoveryGrantId, lane: 'canary', scope, operationRef, usedAt: now(),
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
      incidentControl, ids: ids, now: now,
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
  const refusal = authorizationRefusal(quote, authorization, request.caller, now())
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

  const rootRunId = ids.next('root-run')
  const leafRunId = ids.next('leaf-run')
  const stepGrantId = ids.next('step-grant')
  const occurredAt = now()
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
    ids: ids,
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

  await lifecycle?.afterRootAdmission?.({ rootRunId, leafRunId, bindingId: adapter.binding.bindingId })
  const released = releasedRun({
    run: admitted, grant: primaryGrant,
    ...(primaryDisclosureGrant === undefined ? {} : { disclosureGrant: primaryDisclosureGrant }),
    ...(request.executionPurpose === 'incident_canary' ? { canaryRecoveryGrantId: request.canaryRecoveryGrantId } : {}),
    ids: ids, occurredAt: now(),
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
      const run = incidentFrozenRun({ run: admitted, decision: providerRelease, ids: ids, occurredAt: now() })
      await store.completeExecution(executionScope, run)
      return { kind: 'run_admitted', run }
    }
  }
  if (primaryGrant.incidentEpochDigest !== providerRelease.epochDigest) {
    const run = incidentEpochStaleRun({ run: admitted, epochDigest: providerRelease.epochDigest, ids: ids, occurredAt: now() })
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
        const run = incidentFrozenRun({ run: admitted, decision: dataRelease, ids: ids, occurredAt: now() })
        await store.completeExecution(executionScope, run)
        return { kind: 'run_admitted', run }
      }
    }
    if (primaryDisclosureGrant.incidentEpochDigest !== dataRelease.epochDigest) {
      const run = incidentEpochStaleRun({ run: admitted, epochDigest: dataRelease.epochDigest, ids: ids, occurredAt: now() })
      await store.completeExecution(executionScope, run)
      return { kind: 'run_admitted', run }
    }
  }
  const release = await store.authorizeProviderRelease({
    grant: primaryGrant,
    ...(primaryDisclosureGrant === undefined ? {} : { disclosureGrant: primaryDisclosureGrant }),
    releasedAt: now(),
    run: released,
    ...(request.executionPurpose === 'incident_canary' ? { canaryRecoveryGrantId: request.canaryRecoveryGrantId } : {}),
  })
  if (release === 'cancelled') {
    const run = cancelledRun({ quote, rootRunId, authorized: money(claim.authorization.currency, claim.authorization.maximumSpendMinor), budgetAuthorityRef: claim.authorization.budgetAuthorityRef, budgetMaximumGrossMinor: claim.authorization.budgetMaximumGrossMinor, ids: ids, occurredAt: now() })
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
          ids: ids,
          occurredAt: now(),
        })
      : incidentEpochStaleRun({ run: admitted, epochDigest: release.epochDigest, ids: ids, occurredAt: now() })
    await store.completeExecution(executionScope, run)
    return { kind: 'run_admitted', run }
  }
  if (release !== 'released' && release !== 'already_released') return { kind: 'execution_refused', reason: 'execution_claim_lost' }

  const records: ProtocolRecord[] = [...released.records]

  const outcome = await adapter.execute({ rootRunId, leafRunId, stepGrantId, idempotencyKey: request.idempotencyKey, ...(primary.providerQuoteRef === undefined ? {} : { providerQuoteRef: primary.providerQuoteRef }), data: primaryData })
    .catch(() => ({ kind: 'outcome_unknown' as const }))
  if (primaryDisclosureGrant !== undefined && 'dataReleaseDisposition' in outcome && outcome.dataReleaseDisposition === 'released') await store.resolveDisclosureAttempt(primaryDisclosureGrant.disclosureGrantId, 'released', now())
  await lifecycle?.afterProviderOutcome?.({ rootRunId, leafRunId, bindingId: adapter.binding.bindingId })
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
          ids: ids, now: now,
        })
        await store.completeExecution(executionScope, run)
        return { kind: 'run_admitted', run }
      }
    }
  }

  const run = outcome.kind === 'effect_committed'
    ? completedRun({ quote, rootRunId, leafRunId, stepGrantId, authorized, providerReference: outcome.providerReference, outcome: outcome.outcome, reportedCost: outcome.reportedCost, records, ids: ids, occurredAt })
    : outcome.kind === 'effect_not_committed'
      ? failedRun({ quote, rootRunId, leafRunId, stepGrantId, authorized, reason: outcome.reason, ...outcome.providerReference === undefined ? {} : { providerReference: outcome.providerReference }, records, ids: ids, occurredAt })
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
        ids: ids,
        occurredAt,
      })

  await store.completeExecution(executionScope, run)
  return { kind: 'run_admitted', run }
}

  return execute
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

