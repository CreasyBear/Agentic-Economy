import type {
  CandidateGraphStepQuote,
  CapabilityBindingAdapter,
  KernelIdFactory,
  Money,
  ProtocolRecord,
  RootRunSnapshot,
  RouteAuthorization,
  RouteQuote,
} from '../model'
import type { KernelStore } from '../store'
import {
  disclosureGrantForStep,
  grantForStep,
  projectDataForStep,
} from './grants'
import {
  disclosureGrantRecordDetails,
  providerCostRecord,
  record,
  runCost,
  stepGrantRecordDetails,
} from '../shared/run-snapshots'

export async function executeFallbackAfterDefiniteFailure(input: {
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
