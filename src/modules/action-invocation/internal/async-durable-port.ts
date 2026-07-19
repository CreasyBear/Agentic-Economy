import type { ActionResult } from '@/modules/common/action'
import type {
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
  PersistControlCommand,
  PersistControlResult,
} from './durable-contracts'

/**
 * Runtime boundary implemented by the internal Convex command/query wrappers.
 * It is intentionally async: Convex persistence is never presented as the
 * synchronous development double.
 */
export interface AsyncDurableActionInvocationPort<Result extends ActionResult = ActionResult> {
  transact(command: PersistControlCommand<Result>): Promise<PersistControlResult>
  readControl(invocationRef: string): Promise<DurableControlRow<Result> | undefined>
  readAttempts(input: Readonly<{
    invocationRef: string
    cursor: string | null
    numItems: number
  }>): Promise<Readonly<{
    page: readonly DurableAttemptRow[]
    continueCursor: string
    isDone: boolean
  }>>
  readAttempt(invocationRef: string, attemptRef: string): Promise<DurableAttemptRow | undefined>
  readHistory(input: Readonly<{
    invocationRef: string
    cursor: string | null
    numItems: number
  }>): Promise<Readonly<{
    page: readonly DurableHistoryRow[]
    continueCursor: string
    isDone: boolean
  }>>
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
