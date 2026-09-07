import type { ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type {
  ActionAttemptView,
  ActionExecutionLimits,
  ActionExecutionView,
  AuthorityBindingSnapshot,
} from '../contracts'

export type DurableControlRow<Result extends ActionResult = ActionResult> = Readonly<{
  executionRef: string
  executionVersion: number
  sourceRef: string
  sourceResultRef?: string
  sourceResultDigest?: string
  terminalBusinessOutcome?: string
  terminalResultReferenceable?: boolean
  control: Omit<ActionExecutionView<Result>, 'prepared' | 'observedResolution' | 'attempts'>
  authorityBinding?: AuthorityBindingSnapshot
  preparedMaterialDigest?: string
  preparedTargetDigest?: string
  consequence?: string
  dataLimitSummary?: ActionExecutionLimits
  authorityDecisionAt?: string
  currentAttemptRef?: string
  currentEffectGeneration?: number
  currentLeaseOwner?: string
  currentLeaseExpiresAt?: string
  updatedAt: string
}>

/**
 * Rebuild a durable control projection only from its canonical nested control
 * state. The durable row is already validated by its port/snapshot boundary;
 * this helper rejects malformed authority values instead of inventing them.
 */
export function reconstructDurableControlRow<Result extends ActionResult>(
  row: DurableControlRow<Result>,
): DurableControlRow<Result> {
  if (!isRecord(row.control)) throw new Error('durable_control_row_invalid')
  const acceptedAuthority = row.control.acceptedAuthority
  if (acceptedAuthority !== undefined) {
    if (!isAcceptedAuthority(acceptedAuthority)) {
      throw new Error('durable_control_authority_invalid')
    }
    canonicalDigest(acceptedAuthority)
  }
  return row
}

function isAcceptedAuthority(
  value: unknown,
): value is NonNullable<ActionExecutionView['acceptedAuthority']> {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'approval_required') {
    return typeof value.authorityRef === 'string' && value.authorityRef.length > 0
  }
  if (value.kind === 'spending_policy_use') {
    const spendingPolicyVersion = value.spendingPolicyVersion
    const spendingPolicyGeneration = value.spendingPolicyGeneration
    return typeof value.spendingPolicyRef === 'string'
      && value.spendingPolicyRef.length > 0
      && typeof spendingPolicyVersion === 'number'
      && Number.isSafeInteger(spendingPolicyVersion)
      && spendingPolicyVersion >= 1
      && typeof spendingPolicyGeneration === 'number'
      && Number.isSafeInteger(spendingPolicyGeneration)
      && spendingPolicyGeneration >= 1
      && typeof value.authorityUseRef === 'string'
      && value.authorityUseRef.length > 0
      && typeof value.grantEvidenceRef === 'string'
      && value.grantEvidenceRef.length > 0
  }
  if (value.kind !== 'customer_request_authorization_use') return false
  const requestRevision = value.requestRevision
  const routeGeneration = value.routeGeneration
  const authorization = value.authorization
  if (
    typeof value.requestAuthorizationRef !== 'string'
    || value.requestAuthorizationRef.length === 0
    || typeof value.requestAuthorizationDigest !== 'string'
    || value.requestAuthorizationDigest.length === 0
    || typeof requestRevision !== 'number'
    || !Number.isSafeInteger(requestRevision)
    || requestRevision < 1
    || typeof routeGeneration !== 'number'
    || !Number.isSafeInteger(routeGeneration)
    || routeGeneration < 1
    || typeof value.grantRef !== 'string'
    || value.grantRef.length === 0
    || typeof value.grantDigest !== 'string'
    || value.grantDigest.length === 0
    || !isRecord(authorization)
    || typeof authorization.kind !== 'string'
  ) return false
  if (authorization.kind === 'explicit') {
    return typeof authorization.authorizationEvidenceRef === 'string'
      && authorization.authorizationEvidenceRef.length > 0
      && typeof authorization.authorizationEvidenceDigest === 'string'
      && authorization.authorizationEvidenceDigest.length > 0
  }
  return authorization.kind === 'spending_policy_low_risk'
    && typeof authorization.spendingPolicyRef === 'string'
    && authorization.spendingPolicyRef.length > 0
    && typeof authorization.spendingPolicyDigest === 'string'
    && authorization.spendingPolicyDigest.length > 0
    && typeof authorization.authorityUseRef === 'string'
    && authorization.authorityUseRef.length > 0
}

export type DurableAttemptOutcome =
  | Readonly<{ state: 'running' }>
  | Readonly<{ state: 'returned'; businessOutcome: string }>
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
  executionRef: string
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
  executionRef: string,
  attempt: ActionAttemptView,
  recordedAt: string,
): DurableAttemptRow {
  return { executionRef, ...attempt, recordedAt }
}

export function restoreDurableAttempt(row: DurableAttemptRow): ActionAttemptView {
  return {
    attemptRef: row.attemptRef, attemptNumber: row.attemptNumber, actor: row.actor,
    effectGeneration: row.effectGeneration, lease: row.lease, idempotency: row.idempotency,
    release: row.release, outcome: row.outcome,
  }
}


export type DurableHistoryRow = Readonly<{
  executionRef: string
  commandId: string
  commandDigest: string
  commandResult: 'applied' | 'duplicate'
  executionVersion: number
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
  expectedExecutionVersion: number | null
  expectedEffectGeneration?: number
  row: DurableControlRow<Result>
  currentAttemptWrite?: DurableAttemptRow
  history: Omit<DurableHistoryRow, 'executionVersion' | 'recordedAt' | 'current'>
  canonicalCommandMaterial?: StableHashValue
}>

export type PersistControlResult =
  | Readonly<{ kind: 'applied' | 'duplicate'; executionVersion: number }>
  | Readonly<{ kind: 'refused'; code: 'stale_execution_version' | 'effect_generation_stale' |
    'lease_not_current' | 'command_identity_conflict' | 'reconciliation_required' }>

export interface DurableActionExecutionPort<Result extends ActionResult = ActionResult> {
  transact(command: PersistControlCommand<Result>): Promise<PersistControlResult>
  readControl(executionRef: string): Promise<DurableControlRow<Result> | undefined>
  readAttempts(executionRef: string, limit: number): Promise<readonly DurableAttemptRow[]>
  readAttempt(executionRef: string, attemptRef: string): Promise<DurableAttemptRow | undefined>
  readHistory(executionRef: string, afterVersion: number, limit: number): Promise<readonly DurableHistoryRow[]>
  readHistoryCommand(executionRef: string, commandId: string): Promise<DurableHistoryRow | undefined>
  recordLateObservation(input: Readonly<{
    executionRef: string
    commandId: string
    effectGeneration: number
    actorRef: string
    sourceEvidenceRef: string
    release: 'not_released' | 'released' | 'possibly_released'
    evidenceDigest: string
    recordedAt: string
  }>): Promise<PersistControlResult>
}
