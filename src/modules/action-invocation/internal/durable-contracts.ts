import type { ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  ActionAttemptView,
  ActionInvocationView,
  AuthorityBindingSnapshot,
} from '../contracts'

export type DurableControlRow<Result extends ActionResult = ActionResult> = Readonly<{
  invocationRef: string
  invocationVersion: number
  sourceRef: string
  sourceResultRef?: string
  sourceResultDigest?: string
  terminalBusinessOutcome?: string
  control: Omit<ActionInvocationView<Result>, 'prepared' | 'observedResolution' | 'attempts'>
  authorityBinding?: AuthorityBindingSnapshot
  preparedMaterialDigest?: string
  preparedTargetDigest?: string
  consequence?: string
  dataLimitSummary?: Readonly<Record<string, number>>
  authorityDecisionAt?: string
  currentAttemptRef?: string
  currentEffectGeneration?: number
  currentLeaseOwner?: string
  currentLeaseExpiresAt?: string
  updatedAt: string
}>

export type DurableAttemptOutcome =
  | Readonly<{ state: 'running' }>
  | Readonly<{ state: 'returned'; businessOutcome: 'queued_communication' | 'refused' | 'not_found' | 'completed' }>
  | Readonly<{ state: 'failed'; retry: 'safe_before_release'; errorDigest?: string }>
  | Readonly<{
      state: 'uncertain'
      retry: 'reconcile_before_retry'
      errorDigest?: string
      reconciliationRequiredAt: string
    }>
  | Readonly<{
      state: 'timed_out'
      timeoutMs: number
      retry: 'reconcile_before_retry'
      reconciliationRequiredAt: string
    }>
  | Readonly<{ state: 'reconciled_not_released'; retry: 'safe_after_reconciliation'; observedAt: string }>
  | Readonly<{ state: 'reconciled_released'; externalOutcome: 'unknown'; observedAt: string }>

export type DurableAttemptRow = Readonly<{
  invocationRef: string
  attemptRef: string
  attemptNumber: number
  actor: ActionAttemptView['actor']
  effectGeneration: number
  lease: ActionAttemptView['lease']
  idempotency: ActionAttemptView['idempotency']
  release: ActionAttemptView['release']
  outcome: DurableAttemptOutcome
  recordedAt: string
}>

export function projectDurableAttempt(
  invocationRef: string,
  attempt: ActionAttemptView,
  recordedAt: string,
): DurableAttemptRow {
  const outcome: DurableAttemptOutcome =
    attempt.outcome.state === 'failed'
      ? { state: 'failed', retry: attempt.outcome.retry, errorDigest: canonicalDigest(attempt.outcome.message) }
      : attempt.outcome.state === 'uncertain'
        ? {
            state: 'uncertain',
            retry: attempt.outcome.retry,
            errorDigest: canonicalDigest(attempt.outcome.message),
            reconciliationRequiredAt: attempt.outcome.reconciliationRequiredAt,
          }
        : attempt.outcome
  return { invocationRef, ...attempt, outcome, recordedAt }
}

export function restoreDurableAttempt(row: DurableAttemptRow): ActionAttemptView {
  const outcome: ActionAttemptView['outcome'] =
    row.outcome.state === 'failed'
      ? { state: 'failed', retry: row.outcome.retry, message: 'Persisted failure evidence is available by digest.' }
      : row.outcome.state === 'uncertain'
        ? {
            state: 'uncertain',
            retry: row.outcome.retry,
            message: 'Persisted uncertainty evidence is available by digest.',
            reconciliationRequiredAt: row.outcome.reconciliationRequiredAt,
          }
        : row.outcome
  return {
    attemptRef: row.attemptRef, attemptNumber: row.attemptNumber, actor: row.actor,
    effectGeneration: row.effectGeneration, lease: row.lease, idempotency: row.idempotency,
    release: row.release, outcome,
  }
}

export type DurableHistoryRow = Readonly<{
  invocationRef: string
  commandId: string
  commandDigest: string
  commandResult: 'applied' | 'duplicate'
  invocationVersion: number
  effectGeneration?: number
  kind: string
  current: boolean
  actorRef?: string
  sourceEvidenceRef?: string
  observation?: Readonly<{
    kind: 'release_observation'
    release: 'not_released' | 'released' | 'possibly_released'
    evidenceDigest: string
  }>
  attemptTransition?: Readonly<{
    attemptRef: string
    effectGeneration: number
    priorDigest: string
    nextDigest: string
    priorReleaseState: ActionAttemptView['release']['state']
    nextReleaseState: ActionAttemptView['release']['state']
    priorOutcomeState: ActionAttemptView['outcome']['state']
    nextOutcomeState: ActionAttemptView['outcome']['state']
  }>
  recordedAt: string
}>

export type PersistControlCommand<Result extends ActionResult = ActionResult> = Readonly<{
  commandId: string
  commandDigest: string
  expectedInvocationVersion: number | null
  expectedEffectGeneration?: number
  row: DurableControlRow<Result>
  currentAttemptWrite?: DurableAttemptRow
  history: Omit<DurableHistoryRow, 'invocationVersion' | 'recordedAt' | 'current'>
}>

export type PersistControlResult =
  | Readonly<{ kind: 'applied' | 'duplicate'; invocationVersion: number }>
  | Readonly<{ kind: 'refused'; code: 'stale_invocation_version' | 'effect_generation_stale' | 'lease_not_current' | 'command_identity_conflict' }>

export interface DurableActionInvocationPort<Result extends ActionResult = ActionResult> {
  transact(command: PersistControlCommand<Result>): PersistControlResult
  readControl(invocationRef: string): DurableControlRow<Result> | undefined
  readAttempts(invocationRef: string, limit: number): readonly DurableAttemptRow[]
  readAttempt(invocationRef: string, attemptRef: string): DurableAttemptRow | undefined
  readHistory(invocationRef: string, afterVersion: number, limit: number): readonly DurableHistoryRow[]
  readHistoryCommand(invocationRef: string, commandId: string): DurableHistoryRow | undefined
  recordLateObservation(input: Readonly<{
    invocationRef: string
    commandId: string
    effectGeneration: number
    actorRef: string
    sourceEvidenceRef: string
    release: 'not_released' | 'released' | 'possibly_released'
    evidenceDigest: string
    recordedAt: string
  }>): PersistControlResult
}
