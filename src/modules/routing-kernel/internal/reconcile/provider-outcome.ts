import { canonicalAuthorityDigest } from '../authority-digest'
import type {
  CapabilityBindingAdapter,
  KernelIdFactory,
  RootRunSnapshot,
} from '../model'
import type { IncidentEvaluator } from '../../incident-control'
import type { KernelStore } from '../store'
import type {
  ReconcileProviderOutcomeInput,
  ReconcileProviderOutcomeResult,
} from '../kernel'
import type { IncidentScope } from '../../incident-control'
import { providerCostRecord, record } from '../shared/run-snapshots'
import { runIncidentScope, sameCaller } from '../shared/incident-scope'

export type CreateReconcileProviderOutcomeInput = Readonly<{
  store: KernelStore
  adapters: ReadonlyMap<string, CapabilityBindingAdapter>
  incidentControl: IncidentEvaluator
  ids: KernelIdFactory
  now: () => number
  claimRecovery: (request: {
    recoveryGrantId: string | undefined
    scope: IncidentScope
    operationRef: string
  }) => Promise<boolean>
}>

export function createReconcileProviderOutcome(
  input: CreateReconcileProviderOutcomeInput,
): (request: ReconcileProviderOutcomeInput) => Promise<ReconcileProviderOutcomeResult> {
  const { store, adapters, incidentControl, ids, now, claimRecovery } = input

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

  const observedAt = now()
  const providerReference = outcome.providerReference ?? leaf.providerReference
  const evidenceRecord = record(ids, observedAt, current.rootRunId, 'provider_reconciliation_observed', {
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
    records: [...current.records, evidenceRecord, record(ids, observedAt, current.rootRunId, 'root_run_reconciled', { incidentEpochDigest: current.incidentEpochDigest })],
  })
  const applied = await store.reconcileRun(current.rootRunId, leaf.leafRunId, resolved)
  if (typeof applied !== 'string') return { kind: 'provider_reconciliation_refused', reason: 'incident_frozen' }
  if (applied === 'applied') return { kind: 'provider_outcome_reconciled', run: resolved }
  return { kind: 'provider_reconciliation_refused', reason: applied }
}

  return reconcileProviderOutcome
}
