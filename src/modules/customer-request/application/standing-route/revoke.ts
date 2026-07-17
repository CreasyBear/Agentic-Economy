import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'

import { projectRepeatPermission } from './project'
import type {
  RepeatPermissionResult,
  RevokeStandingRouteInput,
  StandingRoutePorts,
} from './types'

export async function revokeStandingRoute(
  input: RevokeStandingRouteInput,
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
  const result = await ports.revokeStandingPolicy({
    requestId: input.requestRef,
    policyRef: resolved.policy.policyRef,
    expectedPolicyDigest: resolved.policy.policyDigest,
    idempotencyKey: input.idempotencyKey,
    ...(input.serviceAuthorization === undefined ? {} : {
      serviceAuthorization: input.serviceAuthorization,
    }),
  })
  if (result.kind === 'revoked' || result.kind === 'replayed') {
    return projectRepeatPermission(
      input.requestRef,
      resolved.requestRevision,
      input.routeRef,
      result.policy,
    )
  }
  if (result.kind === 'conflict') {
    return result.reason === 'command_changed'
      ? { kind: 'conflict', requestRef: input.requestRef, reason: 'idempotency_key_reused' }
      : { kind: 'conflict', requestRef: input.requestRef, reason: 'options_changed' }
  }
  return {
    kind: 'unavailable',
    reason: 'repeat_permission_not_available',
    summary: 'AE could not withdraw that repeat permission.',
  }
}
