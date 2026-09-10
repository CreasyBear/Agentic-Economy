import type { ActionResult } from '@/modules/common/action'
import type { KeyUsageView, MoneyQueryPort } from '@/modules/money/public'
import { readKeyUsage } from '@/modules/money/public'
import type {
  ActionExecutionOrigin,
  ActionExecutionTracer,
  ActionExecutionView,
  DecisionRefusalCode,
  ExecutionActor,
} from './contracts'
import type { ReconciliationEvidence } from './reconciliation-evidence'
import type {
  DurableActionExecutionPort,
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
} from './internal/durable-contracts'

const MAX_PUBLIC_ATTEMPTS = 100
const MAX_PUBLIC_HISTORY = 100

export type PublicExecutionAttempt = Readonly<{
  attemptRef: string
  attemptNumber: number
  effectGeneration: number
  release: DurableAttemptRow['release']['state']
  outcome: DurableAttemptRow['outcome']['state']
  retry: string
}>

export type PublicExecutionHistory = Readonly<{
  commandId: string
  executionVersion: number
  effectGeneration?: number
  kind: string
  commandResult: DurableHistoryRow['commandResult']
  current: boolean
  recordedAt: string
}>

export type PublicExecutionStatus = Readonly<{
  kind: 'ok'
  executionRef: string
  executionVersion: number
  action: Readonly<{ id: string; contractVersion: string }>
  toolRef?: string
  origin: ActionExecutionOrigin['kind']
  control: ActionExecutionView['control']['state']
  freshness: ActionExecutionView['freshness']['state']
  authority?: 'approval_required' | 'spending_policy_use' | 'customer_request_authorization_use' | 'public_capability_use'
  attempts: readonly PublicExecutionAttempt[]
  history: readonly PublicExecutionHistory[]
}>

export type PublicExecutionRefusal = Readonly<{
  kind: 'refused'
  code: DecisionRefusalCode | 'execution_not_found' | 'cross_principal_refused'
}>

export type PublicExecutionReadResult = PublicExecutionStatus | PublicExecutionRefusal

export type PublicExecutionCommandResult = Readonly<
  | { kind: 'cancelled'; effect: 'not_released'; status: PublicExecutionStatus }
  | { kind: 'reconciliation_required'; effect: 'possibly_released'; status: PublicExecutionStatus }
  | { kind: 'reconciled'; resolution: ReconciliationEvidence['resolution']; status: PublicExecutionStatus }
  | { kind: 'refused'; code: DecisionRefusalCode; status?: PublicExecutionStatus }
>

/**
 * Read a durable invocation without returning owner, source, input, or
 * provider material. Authorization is checked against the persisted owner
 * before any status/history projection is returned.
 */
export async function readPublicExecutionStatus<Result extends ActionResult>(input: Readonly<{
  port: DurableActionExecutionPort<Result>
  executionRef: string
  actor: ExecutionActor
  attemptLimit?: number
  historyAfterVersion?: number
  historyLimit?: number
}>): Promise<PublicExecutionReadResult> {
  const row = await input.port.readControl(input.executionRef)
  if (row === undefined) return { kind: 'refused', code: 'execution_not_found' }
  if (row.control.owner.callerRef !== input.actor.callerRef || row.control.owner.principalRef !== input.actor.principalRef) {
    return { kind: 'refused', code: 'cross_principal_refused' }
  }
  const attemptLimit = Math.min(MAX_PUBLIC_ATTEMPTS, Math.max(1, Math.trunc(input.attemptLimit ?? MAX_PUBLIC_ATTEMPTS)))
  const historyLimit = Math.min(MAX_PUBLIC_HISTORY, Math.max(1, Math.trunc(input.historyLimit ?? MAX_PUBLIC_HISTORY)))
  const [attemptRows, historyRows] = await Promise.all([
    input.port.readAttempts(input.executionRef, attemptLimit),
    input.port.readHistory(input.executionRef, Math.max(0, Math.trunc(input.historyAfterVersion ?? 0)), historyLimit),
  ])
  return projectPublicExecutionStatus(row, attemptRows, historyRows)
}

/** Project an already-authorized in-memory view for adapter/action responses. */
export function inspectPublicExecution<Result extends ActionResult>(
  view: ActionExecutionView<Result> | undefined,
  actor: ExecutionActor,
): PublicExecutionReadResult {
  if (view === undefined) return { kind: 'refused', code: 'execution_not_found' }
  if (view.owner.callerRef !== actor.callerRef || view.owner.principalRef !== actor.principalRef) {
    return { kind: 'refused', code: 'cross_principal_refused' }
  }
  return projectPublicExecutionView(view)
}

/**
 * Delegate cancellation to the canonical invocation tracer. A lease that has
 * started release is never reported as cancelled: the existing tracer state
 * is projected as reconciliation_required so clients cannot retry blindly.
 */
export async function cancelPublicExecution<Input, Result extends ActionResult>(input: Readonly<{
  tracer: ActionExecutionTracer<Input, Result>
  executionRef: string
  idempotencyKey: string
  actor: ExecutionActor
  origin: ActionExecutionOrigin
}>): Promise<PublicExecutionCommandResult> {
  const view = input.tracer.inspect(input.executionRef)
  if (view === undefined) return { kind: 'refused', code: 'execution_not_found' }
  const result = await input.tracer.cancel({
    executionRef: input.executionRef,
    idempotencyKey: input.idempotencyKey,
    expectedExecutionVersion: view.executionVersion,
    actor: input.actor,
    origin: input.origin,
  })
  if (result.kind === 'refused') {
    return {
      kind: 'refused',
      code: result.code,
      ...(result.view === undefined ? {} : { status: projectPublicExecutionView(result.view) }),
    }
  }
  const status = projectPublicExecutionView(result.view)
  return status.control === 'reconciliation_required'
    ? { kind: 'reconciliation_required', effect: 'possibly_released', status }
    : { kind: 'cancelled', effect: 'not_released', status }
}

/** Delegate reconciliation evidence validation and persistence to the tracer. */
export async function reconcilePublicExecution<Input, Result extends ActionResult>(input: Readonly<{
  tracer: ActionExecutionTracer<Input, Result>
  executionRef: string
  attemptRef: string
  actor: ExecutionActor
  origin: ActionExecutionOrigin
  evidence: ReconciliationEvidence
}>): Promise<PublicExecutionCommandResult> {
  const view = input.tracer.inspect(input.executionRef)
  if (view === undefined) return { kind: 'refused', code: 'execution_not_found' }
  const result = await input.tracer.reconcile({
    executionRef: input.executionRef,
    expectedExecutionVersion: view.executionVersion,
    attemptRef: input.attemptRef,
    actor: input.actor,
    origin: input.origin,
    evidence: input.evidence,
  })
  if (result.kind === 'refused') {
    return {
      kind: 'refused',
      code: result.code,
      ...(result.view === undefined ? {} : { status: projectPublicExecutionView(result.view) }),
    }
  }
  return {
    kind: 'reconciled',
    resolution: input.evidence.resolution,
    status: projectPublicExecutionView(result.view),
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

function projectPublicExecutionStatus<Result extends ActionResult>(
  row: DurableControlRow<Result>,
  attempts: readonly DurableAttemptRow[],
  history: readonly DurableHistoryRow[],
): PublicExecutionStatus {
  const toolRef = row.control.acceptedAuthority?.kind === 'public_capability_use'
    ? row.control.acceptedAuthority.toolRef
    : undefined
  return {
    kind: 'ok',
    executionRef: row.executionRef,
    executionVersion: row.executionVersion,
    action: row.control.action,
    ...(toolRef === undefined ? {} : { toolRef }),
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

function projectPublicExecutionView<Result extends ActionResult>(
  view: ActionExecutionView<Result>,
): PublicExecutionStatus {
  const toolRef = view.acceptedAuthority?.kind === 'public_capability_use'
    ? view.acceptedAuthority.toolRef
    : undefined
  return {
    kind: 'ok',
    executionRef: view.executionRef,
    executionVersion: view.executionVersion,
    action: view.action,
    ...(toolRef === undefined ? {} : { toolRef }),
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

function publicAttempt(attempt: DurableAttemptRow): PublicExecutionAttempt {
  return {
    attemptRef: attempt.attemptRef,
    attemptNumber: attempt.attemptNumber,
    effectGeneration: attempt.effectGeneration,
    release: attempt.release.state,
    outcome: attempt.outcome.state,
    retry: 'retry' in attempt.outcome ? attempt.outcome.retry : 'none',
  }
}

function publicHistory(history: DurableHistoryRow): PublicExecutionHistory {
  return {
    commandId: history.commandId,
    executionVersion: history.executionVersion,
    ...(history.effectGeneration === undefined ? {} : { effectGeneration: history.effectGeneration }),
    kind: history.kind,
    commandResult: history.commandResult,
    current: history.current,
    recordedAt: history.recordedAt,
  }
}
