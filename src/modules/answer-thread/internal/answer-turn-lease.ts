import { ANSWER_TURN_EXECUTION_LEASE_MS } from '../answer-thread.schema'
import {
  renewAnswerTurnLease,
  type ReadAnswerTurnCheckpointResult,
  type RenewAnswerTurnLeaseResult,
} from '../answer-thread.functions'

const ANSWER_TURN_EXECUTION_LEASE_RENEW_INTERVAL_MS = Math.min(
  10_000,
  Math.max(1, Math.floor(ANSWER_TURN_EXECUTION_LEASE_MS / 3)),
)

export type AnswerTurnLeaseConflictReason =
  | Extract<
      ReadAnswerTurnCheckpointResult,
      { kind: 'conflict' }
    >['reason']
  | Extract<
      RenewAnswerTurnLeaseResult,
      { kind: 'conflict' }
    >['reason']

export type AnswerTurnLeaseLoss =
  | {
      kind: 'fence_conflict'
      reason: AnswerTurnLeaseConflictReason
    }
  | { kind: 'transport' }

export function startAnswerTurnLeaseHeartbeat(input: {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
  sourceWriteRequest?: Request
  sourceWriteBody?: string | Uint8Array
  signal: AbortSignal
  onLost: (loss: AnswerTurnLeaseLoss) => void
}): () => void {
  if (input.signal.aborted) return () => {}
  let stopped = false
  let lost = false
  let inFlight = false
  let transportFailures = 0
  let leaseExpiresAt = Date.now() + ANSWER_TURN_EXECUTION_LEASE_MS
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  const lose = (loss: AnswerTurnLeaseLoss): void => {
    if (stopped || lost) return
    lost = true
    input.onLost(loss)
  }
  const armExpiry = (): void => {
    clearTimeout(expiryTimer)
    expiryTimer = setTimeout(() => lose({ kind: 'transport' }), Math.max(
      1,
      leaseExpiresAt - Date.now() - 1,
    ))
  }
  armExpiry()
  const recordTransportFailure = (): void => {
    const now = Date.now()
    if (
      transportFailures === 0
      && now < leaseExpiresAt - ANSWER_TURN_EXECUTION_LEASE_RENEW_INTERVAL_MS
    ) {
      transportFailures = 1
      return
    }
    lose({ kind: 'transport' })
  }
  const renew = async (): Promise<void> => {
    if (stopped || lost || inFlight || input.signal.aborted) return
    inFlight = true
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        renewAnswerTurnLease({
          reservationKey: input.reservationKey,
          requestDigest: input.requestDigest,
          sessionId: input.sessionId,
          threadId: input.threadId,
          turnId: input.turnId,
          turnSeq: input.turnSeq,
          generation: input.generation,
          ...(input.sourceWriteRequest === undefined
            ? {}
            : { sourceWriteRequest: input.sourceWriteRequest }),
          ...(input.sourceWriteBody === undefined
            ? {}
            : { sourceWriteBody: input.sourceWriteBody }),
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('answer_turn_lease_renewal_timeout'))
          }, ANSWER_TURN_EXECUTION_LEASE_RENEW_INTERVAL_MS)
        }),
      ])
      if (result.kind !== 'renewed') {
        lose({ kind: 'fence_conflict', reason: result.reason })
        return
      }
      transportFailures = 0
      leaseExpiresAt = Date.now() + ANSWER_TURN_EXECUTION_LEASE_MS
      armExpiry()
    } catch {
      recordTransportFailure()
    } finally {
      clearTimeout(timeout)
      inFlight = false
    }
  }
  const timer = setInterval(() => {
    void renew()
  }, ANSWER_TURN_EXECUTION_LEASE_RENEW_INTERVAL_MS)
  return () => {
    stopped = true
    clearInterval(timer)
    clearTimeout(expiryTimer)
  }
}
