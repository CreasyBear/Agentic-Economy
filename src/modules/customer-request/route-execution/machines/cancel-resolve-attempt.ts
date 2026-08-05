import type { CancelMutationPorts } from './cancel-ports'
import type {
  ResolveCancellationCommand,
  ResolveCancellationResult,
} from './types'

export async function resolveCancellationAttempt(
  args: ResolveCancellationCommand,
  ports: CancelMutationPorts,
): Promise<ResolveCancellationResult> {
  const now = ports.now()
  const cancellation = await ports.loadCancellationAttempt(args.cancellationRef)
  if (cancellation === null) return { kind: 'refused' }
  const [run, attempt] = await Promise.all([
    ports.loadRunByRef(cancellation.runRef),
    ports.loadAttemptByRef(cancellation.attemptRef),
  ])
  if (run === null || attempt === null || attempt.runRef !== run.runRef) {
    throw new Error('customer_request_route_cancellation_integrity_failure')
  }
  if (cancellation.state !== 'pending') {
    const replayed = await ports.loadRunProjection(run.runRef)
    if (replayed === null) throw new Error('customer_request_route_run_integrity_failure')
    return { kind: 'replayed', run: replayed }
  }
  const state = args.observation.disposition === 'accepted'
    ? 'accepted' as const
    : args.observation.disposition === 'rejected' || args.observation.disposition === 'unsupported'
      ? 'rejected' as const
      : 'unknown' as const
  await ports.commitCancellationObservation({
    cancellationRef: cancellation.cancellationRef,
    state,
    observation: args.observation,
    now,
  })
  if (state === 'accepted') {
    await ports.resolveCancellationCommand(run.runRef, 'cancelled')
    await ports.commitAcceptedCancellation({
      runRef: run.runRef,
      attemptRef: attempt.attemptRef,
      position: attempt.position,
      now,
    })
  } else if (state === 'rejected') {
    await ports.resolveCancellationCommand(run.runRef, 'rejected')
    if (attempt.state === 'succeeded' && attempt.position < run.totalSteps) {
      const advanced = await ports.queueNextStepAfterRejectedCancel(
        run.runRef, attempt.position + 1, now,
      )
      if (!advanced) {
        await ports.markUnknownAfterRejectedCancel(run.runRef, attempt.attemptRef, now)
      }
    }
  }
  const projection = await ports.loadRunProjection(run.runRef)
  if (projection === null) throw new Error('customer_request_route_run_integrity_failure')
  return { kind: 'recorded', run: projection }
}
