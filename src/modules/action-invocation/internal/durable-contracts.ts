import type { ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type {
  ActionAttemptView,
  ActionInvocationLimits,
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
  terminalResultReferenceable?: boolean
  control: Omit<ActionInvocationView<Result>, 'prepared' | 'observedResolution' | 'attempts'>
  authorityBinding?: AuthorityBindingSnapshot
  preparedMaterialDigest?: string
  preparedTargetDigest?: string
  consequence?: string
  dataLimitSummary?: ActionInvocationLimits
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
): value is NonNullable<ActionInvocationView['acceptedAuthority']> {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'approve_each') {
    return typeof value.authorityRef === 'string' && value.authorityRef.length > 0
  }
  if (value.kind === 'standing_mandate_use') {
    const mandateVersion = value.mandateVersion
    const mandateGeneration = value.mandateGeneration
    return typeof value.mandateRef === 'string'
      && value.mandateRef.length > 0
      && typeof mandateVersion === 'number'
      && Number.isSafeInteger(mandateVersion)
      && mandateVersion >= 1
      && typeof mandateGeneration === 'number'
      && Number.isSafeInteger(mandateGeneration)
      && mandateGeneration >= 1
      && typeof value.authorityUseRef === 'string'
      && value.authorityUseRef.length > 0
      && typeof value.grantEvidenceRef === 'string'
      && value.grantEvidenceRef.length > 0
  }
  if (value.kind !== 'customer_request_mandate_use') return false
  const requestRevision = value.requestRevision
  const routeGeneration = value.routeGeneration
  const authorization = value.authorization
  if (
    typeof value.mandateRef !== 'string'
    || value.mandateRef.length === 0
    || typeof value.mandateDigest !== 'string'
    || value.mandateDigest.length === 0
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
  return authorization.kind === 'standing_low_risk'
    && typeof authorization.standingPolicyRef === 'string'
    && authorization.standingPolicyRef.length > 0
    && typeof authorization.standingPolicyDigest === 'string'
    && authorization.standingPolicyDigest.length > 0
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
  return { invocationRef, ...attempt, recordedAt }
}

export function restoreDurableAttempt(row: DurableAttemptRow): ActionAttemptView {
  return {
    attemptRef: row.attemptRef, attemptNumber: row.attemptNumber, actor: row.actor,
    effectGeneration: row.effectGeneration, lease: row.lease, idempotency: row.idempotency,
    release: row.release, outcome: row.outcome,
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
  canonicalCommandMaterial?: StableHashValue
}>

export type PersistControlResult =
  | Readonly<{ kind: 'applied' | 'duplicate'; invocationVersion: number }>
  | Readonly<{ kind: 'refused'; code: 'stale_invocation_version' | 'effect_generation_stale' |
    'lease_not_current' | 'command_identity_conflict' | 'reconciliation_required' }>

export interface DurableActionInvocationPort<Result extends ActionResult = ActionResult> {
  transact(command: PersistControlCommand<Result>): Promise<PersistControlResult>
  readControl(invocationRef: string): Promise<DurableControlRow<Result> | undefined>
  readAttempts(invocationRef: string, limit: number): Promise<readonly DurableAttemptRow[]>
  readAttempt(invocationRef: string, attemptRef: string): Promise<DurableAttemptRow | undefined>
  readHistory(invocationRef: string, afterVersion: number, limit: number): Promise<readonly DurableHistoryRow[]>
  readHistoryCommand(invocationRef: string, commandId: string): Promise<DurableHistoryRow | undefined>
  recordLateObservation(input: Readonly<{
    invocationRef: string
    commandId: string
    effectGeneration: number
    actorRef: string
    sourceEvidenceRef: string
    release: 'not_released' | 'released' | 'possibly_released'
    evidenceDigest: string
    recordedAt: string
  }>): Promise<PersistControlResult>
}
