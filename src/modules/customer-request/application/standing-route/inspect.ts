import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'

import { projectRepeatPermission } from './project'
import type {
  InspectStandingRouteInput,
  RepeatPermissionResult,
  StandingRoutePorts,
} from './types'

export async function inspectStandingRoute(
  input: InspectStandingRouteInput,
  ports: StandingRoutePorts,
): Promise<RepeatPermissionResult> {
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== input.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  const resolved = await ports.resolvePermission({
    requestId: input.requestRef,
    permissionRef: input.permissionRef,
    principalId: input.principalId,
  })
  if (resolved.kind !== 'found'
    || resolved.policy.routes[0] === undefined
    || customerRouteRef(
      resolved.policy.generationRef,
      resolved.policy.routes[0].routePlanId,
    ) !== input.routeRef) {
    return {
      kind: 'unavailable',
      reason: 'repeat_permission_not_available',
      summary: 'AE could not find that repeat permission for this choice.',
    }
  }
  return projectRepeatPermission(
    input.requestRef,
    resolved.requestRevision,
    input.routeRef,
    resolved.policy,
  )
}
