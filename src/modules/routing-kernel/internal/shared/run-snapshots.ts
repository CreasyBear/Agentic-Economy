import type {
  DisclosureGrant,
  KernelIdFactory,
  Money,
  ProtocolRecord,
  RootRunSnapshot,
  RouteQuote,
  StepGrant,
} from '../model'
import type { IncidentEvaluation } from '../../incident-control'

export function admittedRun(input: {
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

export function incidentFrozenRun(input: {
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

export function incidentEpochStaleRun(input: {
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

export function releasedRun(input: {
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

export function cancelledRun(input: { quote: RouteQuote; rootRunId: string; authorized: Money; budgetAuthorityRef: string; budgetMaximumGrossMinor: number; ids: KernelIdFactory; occurredAt: number }): RootRunSnapshot {
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

export function failedRun(input: {
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

export function stepGrantRecordDetails(grant: StepGrant) {
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

export function disclosureGrantRecordDetails(grant: DisclosureGrant) {
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

export function completedRun(input: {
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

export function unknownRun(input: {
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

export function record(
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

export function money(currency: string, amountMinor: number): Money {
  return Object.freeze({ currency, amountMinor })
}

export function runCost(
  authorized: Money,
  quotedMaximum: Money,
  reserved: Money | null = null,
  providerReported: Money | null = null,
) {
  return Object.freeze({ authorized, quotedMaximum, reserved, providerReported, settled: null })
}

export function providerCostRecord(reportedCost: Money | undefined) {
  return reportedCost === undefined
    ? {}
    : { reportedCost, financialObservation: 'provider_reported' as const }
}

