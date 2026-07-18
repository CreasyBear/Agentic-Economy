import {
  recoverDispatchAttemptAligned,
  recoverDispatchLeaseStillCurrent,
  recoverExpiredDispatchKind,
  routeDispatchIntegrityValid,
} from '../journal'

import type { DispatchLifecyclePorts } from './dispatch-lifecycle-ports'
import type {
  RecoverExpiredDispatchCommand,
  RecoverExpiredDispatchResult,
} from './types'

export async function recoverExpiredDispatch(
  args: RecoverExpiredDispatchCommand,
  ports: DispatchLifecyclePorts,
): Promise<RecoverExpiredDispatchResult> {
  const now = ports.now()
  const dispatch = await ports.loadDispatchByRef(args.dispatchRef)
  if (recoverDispatchLeaseStillCurrent(dispatch, now) || dispatch === null) {
    return { kind: 'unchanged' }
  }
  if (!routeDispatchIntegrityValid(dispatch)) {
    throw new Error('customer_request_route_dispatch_integrity_failure')
  }
  const attempt = await ports.loadAttemptByRef(dispatch.attemptRef)
  if (!recoverDispatchAttemptAligned({ attempt, dispatch }) || attempt === null) {
    throw new Error('customer_request_route_dispatch_integrity_failure')
  }
  const kind = recoverExpiredDispatchKind({
    dispatchState: dispatch.state,
    attemptState: attempt.state,
  })
  if (kind === 'requeued') {
    return await ports.commitDispatchRequeued({
      dispatchRef: dispatch.dispatchRef,
      attemptRef: attempt.attemptRef,
      now,
    })
  }
  if (kind === 'outcome_unknown') {
    return await ports.commitDispatchOutcomeUnknown({
      dispatchRef: dispatch.dispatchRef,
      attemptRef: attempt.attemptRef,
      runRef: attempt.runRef,
      now,
    })
  }
  return { kind: 'unchanged' }
}
