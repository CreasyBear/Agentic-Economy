import type { Infer } from 'convex/values'
import { callReceiptValue } from '../internal/convex-schema'
import type { PublicExecutionStatus } from '@/modules/action-execution/runtime'
import type { RecoveryAttempt, RecoveryRow, WorkerRecoveryResult } from './contracts'

export function recoveryNotFound(callRef: string): WorkerRecoveryResult {
  return { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
}

export function projectPureCallStatus(
  row: RecoveryRow,
  status: PublicExecutionStatus,
): Extract<WorkerRecoveryResult, { kind: 'found' }> {
  const latestAttempt = status.attempts.at(-1)
  const attemptRef = latestAttempt?.attemptRef ?? row.attemptRef
  const effectGeneration = latestAttempt?.effectGeneration
  const staleResult = (
    status.control === 'retryable'
    || (status.control === 'reconciliation_required' && row.result?.kind !== 'reconciliation_required')
    || (status.control === 'terminal' && row.result?.kind === 'pending')
    || (status.control === 'cancelled' && row.result?.kind === 'pending')
  )
  const projectedResult = staleResult ? undefined : row.result
  const receipt = projectedResult !== undefined && 'receipt' in projectedResult
    ? projectedResult.receipt
    : undefined
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: status.control,
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(attemptRef === undefined ? {} : { attemptRef }),
    ...(effectGeneration === undefined ? {} : { effectGeneration }),
    ...(receipt === undefined ? {} : { receipt }),
    ...(projectedResult === undefined ? {} : { result: projectedResult }),
  }
}

export function cancelledRecoveryResult(row: RecoveryRow): WorkerRecoveryResult {
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: 'cancelled',
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    result: {
      kind: 'refused',
      toolRef: row.toolRef,
      code: 'invocation_cancelled',
      retryable: false,
    },
  }
}

export function retryableRecoveryResult(
  row: RecoveryRow,
  receipt?: Infer<typeof callReceiptValue>,
): WorkerRecoveryResult {
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: 'retryable',
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(receipt === undefined ? {} : { receipt }),
  }
}

export function projectPersistedRecovery(
  row: RecoveryRow,
  state = row.state,
): Extract<WorkerRecoveryResult, { kind: 'found' }> {
  const effectGeneration = row.result?.kind === 'reconciliation_required'
    ? row.result.evidence.effectGeneration
    : undefined
  const projectedResult = state === 'cancelled' && row.result?.kind === 'pending'
    ? undefined
    : row.result
  const receipt = projectedResult !== undefined && 'receipt' in projectedResult
    ? projectedResult.receipt
    : undefined
  const publicState: PublicExecutionStatus['control'] = state === 'pending'
    ? row.result?.kind === 'needs_authority'
      ? 'awaiting_authority'
      : row.result?.kind === 'reconciliation_required'
        ? 'reconciliation_required'
        : 'in_progress'
    : state === 'reconciliation_required'
      ? 'reconciliation_required'
      : state === 'cancelled'
        ? 'cancelled'
        : 'terminal'
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: publicState,
    ...(effectGeneration === undefined ? {} : { effectGeneration }),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(receipt === undefined ? {} : { receipt }),
    ...(projectedResult === undefined ? {} : { result: projectedResult }),
  }
}

export function recoveryOuterState(
  row: RecoveryRow,
  status: Readonly<{ state: string }>,
): 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled' {
  if (status.state === 'cancelled') return 'cancelled'
  if (status.state === 'reconciliation_required') return 'reconciliation_required'
  return row.state === 'completed' ? 'completed' : 'pending'
}

export function reconciliationResult(
  row: RecoveryRow,
  status: PublicExecutionStatus,
  attemptRows: readonly RecoveryAttempt[],
  operationId: string,
  receipt?: Infer<typeof callReceiptValue>,
): WorkerRecoveryResult {
  const currentAttemptRef = status.attempts.at(-1)?.attemptRef ?? row.attemptRef
  const attempt = attemptRows.find(({ attemptRef }) => attemptRef === currentAttemptRef) ?? attemptRows.at(-1)
  const requiredAt = attempt?.outcome.state === 'uncertain' || attempt?.outcome.state === 'timed_out'
    ? attempt.outcome.reconciliationRequiredAt ?? new Date().toISOString()
    : new Date().toISOString()
  return {
    kind: 'reconciliation_required',
    callRef: row.callRef,
    toolRef: row.toolRef,
    evidence: {
      attemptRef: attempt?.attemptRef ?? currentAttemptRef ?? `operation-attempt:${row.callRef}:1`,
      effectGeneration: attempt?.effectGeneration ?? 1,
      requiredAt,
      retry: 'reconcile_before_retry',
      evidenceSource: `published-tool:${operationId}`,
    },
    ...(receipt === undefined ? {} : { receipt }),
  }
}

