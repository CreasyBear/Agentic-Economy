import type { ActionResult } from '@/modules/common/action'
import type {
  ActionInvocationOrigin,
  ActionInvocationView,
  DecisionRefusalCode,
  InvocationActor,
  InvocationDecision,
} from './contracts'
import { reconcileAttempt, replaceAttempt } from './attempts'
import { currentLease, publishLeaseObservation } from './lease-control'
import { nextView, type StoredInvocation } from './in-memory-record-store'
import {
  validateReconciliationEvidence,
  type ReconciliationEvidence,
} from './reconciliation-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'

type OwnedControlInput = Readonly<{
  expectedInvocationVersion: number
  actor: InvocationActor
  origin: ActionInvocationOrigin
}>

export function publishObservation<Input, Result extends ActionResult>(
  record: StoredInvocation<Input, Result> | undefined,
  input: Readonly<{
    expectedInvocationVersion: number
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
    release: 'not_released' | 'released' | 'possibly_released'
  }>,
  observedAt: string,
): InvocationDecision<Result> {
  if (record === undefined) return { kind: 'refused', code: 'invocation_not_found' }
  if (record.view.invocationVersion !== input.expectedInvocationVersion) {
    return { kind: 'refused', code: 'stale_invocation_version', view: record.view }
  }
  const refusal = currentLease(record.view, input)
  if (refusal !== undefined) return { kind: 'refused', code: refusal, view: record.view }
  const published = publishLeaseObservation({
    view: record.view,
    attemptRef: input.attemptRef,
    release: input.release,
    observedAt,
  })
  if (published === undefined) {
    return { kind: 'refused', code: 'invalid_control_state', view: record.view }
  }
  record.view = published
  return { kind: 'accepted', view: record.view }
}

export function cancelInvocation<Input, Result extends ActionResult>(
  record: StoredInvocation<Input, Result> | undefined,
  input: OwnedControlInput,
): InvocationDecision<Result> {
  const owned = checkOwned(record, input)
  if (owned.kind === 'refused') return owned
  const current = owned.record.view.control
  if (
    current.state === 'authorized' ||
    current.state === 'retryable' ||
    (current.state === 'leased' && (current.release === 'not_started' || current.release === 'not_released'))
  ) {
    owned.record.view = nextView(owned.record.view, {
      control: { state: 'cancelled', effect: 'not_released' },
    })
    return { kind: 'accepted', view: owned.record.view }
  }
  if (current.state === 'leased' || current.state === 'reconciliation_required') {
    owned.record.view = nextView(owned.record.view, {
      control: { state: 'reconciliation_required', attemptRef: current.attemptRef },
    })
    return { kind: 'accepted', view: owned.record.view }
  }
  return { kind: 'refused', code: 'invalid_control_state', view: owned.record.view }
}

export function reconcileInvocation<Input, Result extends ActionResult>(
  record: StoredInvocation<Input, Result> | undefined,
  input: OwnedControlInput & Readonly<{
    attemptRef: string
    evidence: ReconciliationEvidence
  }>,
  observedAt: string,
  evidenceSource: string | undefined,
  verifySourceEvidence: import('./reconciliation-evidence').ReconciliationEvidenceVerifier | undefined,
): InvocationDecision<Result> {
  const owned = checkOwned(record, input)
  if (owned.kind === 'refused') return owned
  const evidenceDigest = canonicalDigest(input.evidence)
  const priorEvidence = owned.record.reconciliationEvidence?.get(input.evidence.evidenceRef)
  if (priorEvidence !== undefined) {
    return priorEvidence === evidenceDigest
      ? { kind: 'accepted', view: owned.record.view }
      : { kind: 'refused', code: 'command_identity_conflict', view: owned.record.view }
  }
  if (
    owned.record.view.control.state !== 'reconciliation_required' ||
    owned.record.view.control.attemptRef !== input.attemptRef
  ) return { kind: 'refused', code: 'invalid_control_state', view: owned.record.view }
  const attempt = owned.record.view.attempts.find(({ attemptRef }) => attemptRef === input.attemptRef)
  if (attempt === undefined) {
    return { kind: 'refused', code: 'invalid_control_state', view: owned.record.view }
  }
  const reconciliationRequiredAt =
    attempt.outcome.state === 'uncertain' || attempt.outcome.state === 'timed_out'
      ? attempt.outcome.reconciliationRequiredAt
      : undefined
  if (reconciliationRequiredAt === undefined) {
    return { kind: 'refused', code: 'invalid_control_state', view: owned.record.view }
  }
  const evidenceRefusal = validateReconciliationEvidence({
    evidence: input.evidence,
    source: evidenceSource,
    invocationRef: owned.record.view.invocationRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    now: observedAt,
    notBefore: reconciliationRequiredAt,
    verifySourceEvidence,
  })
  if (evidenceRefusal !== undefined) {
    return { kind: 'refused', code: evidenceRefusal, view: owned.record.view }
  }
  owned.record.reconciliationEvidence?.set(input.evidence.evidenceRef, evidenceDigest)
  owned.record.view = nextView(owned.record.view, {
    attempts: replaceAttempt(
      owned.record.view.attempts,
      reconcileAttempt(attempt, input.evidence.resolution, input.evidence.observedAt),
    ),
    control: input.evidence.resolution === 'not_released'
      ? { state: 'retryable', reason: 'pre_release_failure' }
      : { state: 'terminal' },
  })
  return { kind: 'accepted', view: owned.record.view }
}

function checkOwned<Input, Result extends ActionResult>(
  record: StoredInvocation<Input, Result> | undefined,
  input: OwnedControlInput,
): { kind: 'ok'; record: StoredInvocation<Input, Result> } | Readonly<{
  kind: 'refused'
  code: DecisionRefusalCode
  view?: ActionInvocationView<Result>
}> {
  if (record === undefined) return { kind: 'refused', code: 'invocation_not_found' }
  if (record.view.invocationVersion !== input.expectedInvocationVersion) {
    return { kind: 'refused', code: 'stale_invocation_version', view: record.view }
  }
  if (
    record.view.owner.callerRef !== input.actor.callerRef ||
    record.view.owner.principalRef !== input.actor.principalRef
  ) return { kind: 'refused', code: 'cross_principal_refused', view: record.view }
  if (JSON.stringify(record.view.origin) !== JSON.stringify(input.origin)) {
    return { kind: 'refused', code: 'cross_origin_refused', view: record.view }
  }
  return { kind: 'ok', record }
}
