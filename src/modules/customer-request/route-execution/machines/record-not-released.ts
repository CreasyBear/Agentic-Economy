import type { JsonValue } from '@/modules/capability-contract/public'
import { parseRouteTransportObservationJson } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import { routeAttemptIntegrityValid, routeDispatchIntegrityValid } from '../journal'

import type { DispatchLifecyclePorts } from './dispatch-lifecycle-ports'
import type { RecordNotReleasedCommand, RecordNotReleasedResult } from './types'

export async function recordNotReleased(
  args: RecordNotReleasedCommand,
  ports: DispatchLifecyclePorts,
): Promise<RecordNotReleasedResult> {
  const observation = parseRouteTransportObservationJson(args.observationJson)
  if (observation === undefined || observation.disposition !== 'refused' || observation.releaseStarted) {
    return { kind: 'refused', reason: 'dispatch_not_current' }
  }
  const dispatch = await ports.loadDispatchByRef(args.dispatchRef)
  const attempt = await ports.loadAttemptByRef(args.attemptRef)
  if (dispatch === null || attempt === null || dispatch.attemptRef !== attempt.attemptRef
    || !routeDispatchIntegrityValid(dispatch) || !routeAttemptIntegrityValid(attempt)) {
    return { kind: 'refused', reason: 'dispatch_not_current' }
  }
  const run = await ports.loadRunByRef(attempt.runRef)
  if (run === null) throw new Error('customer_request_route_run_integrity_failure')
  if (attempt.state === 'failed' && dispatch.state === 'failed') {
    const replayed = await ports.loadRunProjection(run.runRef)
    if (replayed === null) throw new Error('customer_request_route_run_integrity_failure')
    return { kind: 'replayed', run: replayed }
  }
  if (dispatch.state !== 'pending' || attempt.state !== 'queued') {
    return { kind: 'refused', reason: 'dispatch_not_current' }
  }
  const result: JsonValue = { reason: observation.failureCode ?? 'transport_not_released' }
  return await ports.commitNotReleasedFailed({
    dispatchRef: dispatch.dispatchRef,
    attemptRef: attempt.attemptRef,
    runRef: run.runRef,
    observationJson: args.observationJson,
    observationDigest: canonicalDigest(observation),
    resultJson: JSON.stringify(result),
    resultDigest: canonicalDigest(result),
    now: ports.now(),
  })
}
