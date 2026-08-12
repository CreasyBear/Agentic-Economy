import type { ActionResult } from '@/modules/common/action'
import type { KeyUsageView, MoneyQueryPort } from '@/modules/money/public'
import { readKeyUsage } from '@/modules/money/public'
import type {
  ActionInvocationOrigin,
  ActionInvocationTracer,
  ActionInvocationView,
  DecisionRefusalCode,
  InvocationActor,
} from './contracts'
import type { ReconciliationEvidence } from './reconciliation-evidence'
import type {
  DurableActionInvocationPort,
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
} from './internal/durable-contracts'

const MAX_PUBLIC_ATTEMPTS = 100
const MAX_PUBLIC_HISTORY = 100

export type PublicInvocationAttempt = Readonly<{
  attemptRef: string
  attemptNumber: number
  effectGeneration: number
  release: DurableAttemptRow['release']['state']
  outcome: DurableAttemptRow['outcome']['state']
  retry: string
}>

export type PublicInvocationHistory = Readonly<{
  commandId: string
  invocationVersion: number
  effectGeneration?: number
  kind: string
  commandResult: DurableHistoryRow['commandResult']
  current: boolean
  recordedAt: string
}>

export type PublicInvocationStatus = Readonly<{
  kind: 'ok'
  invocationRef: string
  invocationVersion: number
  action: Readonly<{ id: string; contractVersion: string }>
  operationRef?: string
  origin: ActionInvocationOrigin['kind']
  control: ActionInvocationView['control']['state']
  freshness: ActionInvocationView['freshness']['state']
  authority?: 'approve_each' | 'standing_mandate_use' | 'customer_request_mandate_use' | 'public_capability_use'
  attempts: readonly PublicInvocationAttempt[]
  history: readonly PublicInvocationHistory[]
}>

export type PublicInvocationRefusal = Readonly<{
  kind: 'refused'
  code: DecisionRefusalCode | 'invocation_not_found' | 'cross_principal_refused'
}>

export type PublicInvocationReadResult = PublicInvocationStatus | PublicInvocationRefusal

export type PublicInvocationCommandResult = Readonly<
  | { kind: 'cancelled'; effect: 'not_released'; status: PublicInvocationStatus }
  | { kind: 'reconciliation_required'; effect: 'possibly_released'; status: PublicInvocationStatus }
  | { kind: 'reconciled'; resolution: ReconciliationEvidence['resolution']; status: PublicInvocationStatus }
  | { kind: 'refused'; code: DecisionRefusalCode; status?: PublicInvocationStatus }
>

/**
 * Read a durable invocation without returning owner, source, input, or
 * provider material. Authorization is checked against the persisted owner
 * before any status/history projection is returned.
 */
export async function readPublicInvocationStatus<Result extends ActionResult>(input: Readonly<{
  port: DurableActionInvocationPort<Result>
  invocationRef: string
  actor: InvocationActor
  attemptLimit?: number
  historyAfterVersion?: number
  historyLimit?: number
}>): Promise<PublicInvocationReadResult> {
  const row = await input.port.readControl(input.invocationRef)
  if (row === undefined) return { kind: 'refused', code: 'invocation_not_found' }
  if (row.control.owner.callerRef !== input.actor.callerRef || row.control.owner.principalRef !== input.actor.principalRef) {
    return { kind: 'refused', code: 'cross_principal_refused' }
  }
  const attemptLimit = Math.min(MAX_PUBLIC_ATTEMPTS, Math.max(1, Math.trunc(input.attemptLimit ?? MAX_PUBLIC_ATTEMPTS)))
  const historyLimit = Math.min(MAX_PUBLIC_HISTORY, Math.max(1, Math.trunc(input.historyLimit ?? MAX_PUBLIC_HISTORY)))
  const [attemptRows, historyRows] = await Promise.all([
    input.port.readAttempts(input.invocationRef, attemptLimit),
    input.port.readHistory(input.invocationRef, Math.max(0, Math.trunc(input.historyAfterVersion ?? 0)), historyLimit),
  ])
  return projectPublicInvocationStatus(row, attemptRows, historyRows)
}

/** Project an already-authorized in-memory view for adapter/action responses. */
export function inspectPublicInvocation<Result extends ActionResult>(
  view: ActionInvocationView<Result> | undefined,
  actor: InvocationActor,
): PublicInvocationReadResult {
  if (view === undefined) return { kind: 'refused', code: 'invocation_not_found' }
  if (view.owner.callerRef !== actor.callerRef || view.owner.principalRef !== actor.principalRef) {
    return { kind: 'refused', code: 'cross_principal_refused' }
  }
  return projectPublicInvocationView(view)
}

/**
 * Delegate cancellation to the canonical invocation tracer. A lease that has
 * started release is never reported as cancelled: the existing tracer state
 * is projected as reconciliation_required so clients cannot retry blindly.
 */
export async function cancelPublicInvocation<Input, Result extends ActionResult>(input: Readonly<{
  tracer: ActionInvocationTracer<Input, Result>
  invocationRef: string
  idempotencyKey: string
  actor: InvocationActor
  origin: ActionInvocationOrigin
}>): Promise<PublicInvocationCommandResult> {
  const view = input.tracer.inspect(input.invocationRef)
  if (view === undefined) return { kind: 'refused', code: 'invocation_not_found' }
  const result = await input.tracer.cancel({
    invocationRef: input.invocationRef,
    idempotencyKey: input.idempotencyKey,
    expectedInvocationVersion: view.invocationVersion,
    actor: input.actor,
    origin: input.origin,
  })
  if (result.kind === 'refused') {
    return {
      kind: 'refused',
      code: result.code,
      ...(result.view === undefined ? {} : { status: projectPublicInvocationView(result.view) }),
    }
  }
  const status = projectPublicInvocationView(result.view)
  return status.control === 'reconciliation_required'
    ? { kind: 'reconciliation_required', effect: 'possibly_released', status }
    : { kind: 'cancelled', effect: 'not_released', status }
}

/** Delegate reconciliation evidence validation and persistence to the tracer. */
export async function reconcilePublicInvocation<Input, Result extends ActionResult>(input: Readonly<{
  tracer: ActionInvocationTracer<Input, Result>
  invocationRef: string
  attemptRef: string
  actor: InvocationActor
  origin: ActionInvocationOrigin
  evidence: ReconciliationEvidence
}>): Promise<PublicInvocationCommandResult> {
  const view = input.tracer.inspect(input.invocationRef)
  if (view === undefined) return { kind: 'refused', code: 'invocation_not_found' }
  const result = await input.tracer.reconcile({
    invocationRef: input.invocationRef,
    expectedInvocationVersion: view.invocationVersion,
    attemptRef: input.attemptRef,
    actor: input.actor,
    origin: input.origin,
    evidence: input.evidence,
  })
  if (result.kind === 'refused') {
    return {
      kind: 'refused',
      code: result.code,
      ...(result.view === undefined ? {} : { status: projectPublicInvocationView(result.view) }),
    }
  }
  return {
    kind: 'reconciled',
    resolution: input.evidence.resolution,
    status: projectPublicInvocationView(result.view),
  }
}

/** Reuse the canonical money query port for per-credential usage readback. */
export async function readAgentUsage(input: Readonly<{
  port: MoneyQueryPort
  principalId: string
  credentialId: string
  currency: string
}>): Promise<KeyUsageView> {
  return await readKeyUsage({
    port: input.port,
    query: {
      principalId: input.principalId,
      credentialId: input.credentialId,
      currency: input.currency,
    },
  })
}

function projectPublicInvocationStatus<Result extends ActionResult>(
  row: DurableControlRow<Result>,
  attempts: readonly DurableAttemptRow[],
  history: readonly DurableHistoryRow[],
): PublicInvocationStatus {
  const operationRef = row.control.acceptedAuthority?.kind === 'public_capability_use'
    ? row.control.acceptedAuthority.operationRef
    : undefined
  return {
    kind: 'ok',
    invocationRef: row.invocationRef,
    invocationVersion: row.invocationVersion,
    action: row.control.action,
    ...(operationRef === undefined ? {} : { operationRef }),
    origin: row.control.origin.kind,
    control: row.control.control.state,
    freshness: row.control.freshness.state,
    ...(row.control.acceptedAuthority === undefined ? {} : { authority: row.control.acceptedAuthority.kind }),
    attempts: attempts
      .slice(0, MAX_PUBLIC_ATTEMPTS)
      .map(publicAttempt),
    history: history
      .slice(0, MAX_PUBLIC_HISTORY)
      .map(publicHistory),
  }
}

function projectPublicInvocationView<Result extends ActionResult>(
  view: ActionInvocationView<Result>,
): PublicInvocationStatus {
  const operationRef = view.acceptedAuthority?.kind === 'public_capability_use'
    ? view.acceptedAuthority.operationRef
    : undefined
  return {
    kind: 'ok',
    invocationRef: view.invocationRef,
    invocationVersion: view.invocationVersion,
    action: view.action,
    ...(operationRef === undefined ? {} : { operationRef }),
    origin: view.origin.kind,
    control: view.control.state,
    freshness: view.freshness.state,
    ...(view.acceptedAuthority === undefined ? {} : { authority: view.acceptedAuthority.kind }),
    attempts: view.attempts.slice(0, MAX_PUBLIC_ATTEMPTS).map((attempt) => ({
      attemptRef: attempt.attemptRef,
      attemptNumber: attempt.attemptNumber,
      effectGeneration: attempt.effectGeneration,
      release: attempt.release.state,
      outcome: attempt.outcome.state,
      retry: 'retry' in attempt.outcome ? attempt.outcome.retry : 'none',
    })),
    history: [],
  }
}

function publicAttempt(attempt: DurableAttemptRow): PublicInvocationAttempt {
  return {
    attemptRef: attempt.attemptRef,
    attemptNumber: attempt.attemptNumber,
    effectGeneration: attempt.effectGeneration,
    release: attempt.release.state,
    outcome: attempt.outcome.state,
    retry: 'retry' in attempt.outcome ? attempt.outcome.retry : 'none',
  }
}

function publicHistory(history: DurableHistoryRow): PublicInvocationHistory {
  return {
    commandId: history.commandId,
    invocationVersion: history.invocationVersion,
    ...(history.effectGeneration === undefined ? {} : { effectGeneration: history.effectGeneration }),
    kind: history.kind,
    commandResult: history.commandResult,
    current: history.current,
    recordedAt: history.recordedAt,
  }
}
