import { routeAttemptIntegrityValid, routeDispatchIntegrityValid } from '../journal'

import { currentLeasedInvocation } from './current-leased-invocation'
import type { DispatchLifecyclePorts } from './dispatch-lifecycle-ports'
import type { MarkDispatchedCommand, MarkDispatchedResult } from './types'

export async function markDispatched(
  args: MarkDispatchedCommand,
  ports: DispatchLifecyclePorts,
): Promise<MarkDispatchedResult> {
  const now = ports.now()
  const dispatch = await ports.loadDispatchByRef(args.dispatchRef)
  const attempt = await ports.loadAttemptByRef(args.attemptRef)
  if (dispatch === null || attempt === null || !routeDispatchIntegrityValid(dispatch)
    || !routeAttemptIntegrityValid(attempt) || dispatch.attemptRef !== attempt.attemptRef) {
    return { kind: 'refused', reason: 'lease_not_current' }
  }
  if (dispatch.state === 'delivered'
    && (attempt.state === 'dispatched' || attempt.state === 'accepted'
      || attempt.state === 'succeeded' || attempt.state === 'outcome_unknown')) {
    return { kind: 'replayed' }
  }
  if (dispatch.state !== 'leased' || attempt.state !== 'leased'
    || dispatch.leaseOwner !== args.workerId || (dispatch.leaseExpiresAt ?? 0) <= now) {
    return { kind: 'refused', reason: 'lease_not_current' }
  }
  if (await currentLeasedInvocation({
    dispatchRef: args.dispatchRef,
    workerId: args.workerId,
    now,
  }, ports) === null) {
    return { kind: 'refused', reason: 'lease_not_current' }
  }
  const run = await ports.loadRunByRef(attempt.runRef)
  if (run === null || run.currentPosition !== attempt.position) {
    throw new Error('customer_request_route_run_integrity_failure')
  }
  return await ports.commitMarkDispatched({
    dispatchRef: dispatch.dispatchRef,
    attemptRef: attempt.attemptRef,
    runRef: run.runRef,
    now,
  })
}
