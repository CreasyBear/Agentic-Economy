import { canonicalAuthorityDigest } from '../authority-digest'
import type { KernelIdFactory } from '../model'
import type { IncidentEvaluator } from '../../incident-control'
import type { KernelStore } from '../store'
import type {
  ReconcileProviderCancellationInput,
  ReconcileProviderCancellationResult,
} from '../kernel'
import type { IncidentScope } from '../../incident-control'
import { record } from '../shared/run-snapshots'
import { runIncidentScope } from '../shared/incident-scope'

export type CreateReconcileProviderCancellationInput = Readonly<{
  store: KernelStore
  incidentControl: IncidentEvaluator
  ids: KernelIdFactory
  now: () => number
  claimRecovery: (request: {
    recoveryGrantId: string | undefined
    scope: IncidentScope
    operationRef: string
  }) => Promise<boolean>
}>

export function createReconcileProviderCancellation(
  input: CreateReconcileProviderCancellationInput,
): (request: ReconcileProviderCancellationInput) => Promise<ReconcileProviderCancellationResult> {
  const { store, incidentControl, ids, now, claimRecovery } = input

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
    ids, request.evidence.observedAt, current.rootRunId, recordType, {
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

  return reconcileProviderCancellation
}
