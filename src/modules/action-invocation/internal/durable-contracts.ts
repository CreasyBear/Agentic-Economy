import type { ActionResult } from '@/modules/common/action'
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

export type DurableAttemptRow = ActionAttemptView & Readonly<{
  invocationRef: string
  recordedAt: string
}>

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
  recordedAt: string
}>

export type PersistControlCommand<Result extends ActionResult = ActionResult> = Readonly<{
  commandId: string
  commandDigest: string
  expectedInvocationVersion: number | null
  expectedEffectGeneration?: number
  row: DurableControlRow<Result>
  newAttempt?: DurableAttemptRow
  history: Omit<DurableHistoryRow, 'invocationVersion' | 'recordedAt' | 'current'>
}>

export type PersistControlResult =
  | Readonly<{ kind: 'applied' | 'duplicate'; invocationVersion: number }>
  | Readonly<{ kind: 'refused'; code: 'stale_invocation_version' | 'effect_generation_stale' | 'lease_not_current' | 'command_identity_conflict' }>

export interface DurableActionInvocationPort<Result extends ActionResult = ActionResult> {
  transact(command: PersistControlCommand<Result>): PersistControlResult
  readControl(invocationRef: string): DurableControlRow<Result> | undefined
  readAttempts(invocationRef: string, limit: number): readonly DurableAttemptRow[]
  readHistory(invocationRef: string, afterVersion: number, limit: number): readonly DurableHistoryRow[]
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
