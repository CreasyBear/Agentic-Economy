import type {
  AttemptRecordSnapshot,
  DispatchRecordSnapshot,
  OutcomeCommand,
  OutcomeResult,
  RecordNotReleasedCommand,
  RecordNotReleasedResult,
} from './types'

export type RouteTransportWorkCompletionPorts = Readonly<{
  loadDispatchByRef: (dispatchRef: string) => Promise<DispatchRecordSnapshot | null>
  loadAttemptByRef: (attemptRef: string) => Promise<AttemptRecordSnapshot | null>
  recordNotReleased: (command: RecordNotReleasedCommand) => Promise<RecordNotReleasedResult>
  recordOutcome: (command: OutcomeCommand) => Promise<OutcomeResult>
}>

export type RouteTransportWorkCompletionResult = Readonly<
  | { kind: 'settled' }
  | { kind: 'failed_not_released' }
  | { kind: 'outcome_unknown' }
>

export async function reconcileRouteTransportWorkCompletion(
  dispatchRef: string,
  ports: RouteTransportWorkCompletionPorts,
): Promise<RouteTransportWorkCompletionResult> {
  const dispatch = await ports.loadDispatchByRef(dispatchRef)
  if (dispatch === null) return { kind: 'settled' }
  const attempt = await ports.loadAttemptByRef(dispatch.attemptRef)
  if (attempt === null || attempt.runRef !== dispatch.runRef
    || attempt.operationKeyDigest !== dispatch.operationKeyDigest) {
    return { kind: 'settled' }
  }
  if (dispatch.state === 'pending' && attempt.state === 'queued') {
    const result = await ports.recordNotReleased({
      dispatchRef: dispatch.dispatchRef,
      attemptRef: attempt.attemptRef,
      observationJson: JSON.stringify({
        transport: 'unknown',
        disposition: 'refused',
        releaseStarted: false,
        requestDigest: attempt.inputDigest,
        failureCode: 'route_transport_work_not_released',
      }),
    })
    return result.kind === 'failed' || result.kind === 'replayed'
      ? { kind: 'failed_not_released' }
      : { kind: 'settled' }
  }
  if (dispatch.state === 'delivered'
    && (attempt.state === 'dispatched' || attempt.state === 'accepted')) {
    const result = await ports.recordOutcome({
      attemptRef: attempt.attemptRef,
      operationKeyDigest: attempt.operationKeyDigest,
      observationJson: JSON.stringify({
        transport: 'unknown',
        disposition: 'unknown',
        releaseStarted: true,
        queryReleaseStatus: 'unknown',
        requestDigest: attempt.inputDigest,
        failureCode: 'route_transport_work_outcome_unknown',
      }),
      outcome: { kind: 'unknown' },
    })
    return result.kind === 'outcome_unknown' || result.kind === 'replayed'
      ? { kind: 'outcome_unknown' }
      : { kind: 'settled' }
  }
  return { kind: 'settled' }
}
