import {
  projectNeedsAttention,
  repeatPermissionUseRecoverySummary,
} from '@/modules/customer-request/customer-projection'

import type { CustomerRequestActionResult } from '../action-result'
import { projectConfirmedRoute } from '../route-plan-projection/project-aggregate'
import { resolveSelectableCurrentRoute } from './select'
import type {
  StandingRoutePorts,
  UseStandingRouteInput,
} from './types'

export async function applyStandingRoute(
  input: UseStandingRouteInput,
  ports: StandingRoutePorts,
): Promise<CustomerRequestActionResult> {
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== input.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  if (current.aggregate.snapshot.revision !== input.revision) {
    return { kind: 'conflict', requestRef: input.requestRef, reason: 'revision_changed' }
  }
  const selected = await resolveSelectableCurrentRoute({
    requestRef: input.requestRef,
    routeRef: input.routeRef,
    aggregate: current.aggregate,
    requireKnownMaximumTotalCost: false,
  }, ports)
  if (selected.kind !== 'selected') return selected.preview
  const permission = await ports.resolvePermission({
    requestId: input.requestRef,
    permissionRef: input.permissionRef,
    principalId: input.principalId,
  })
  if (permission.kind !== 'found'
    || permission.policy.delegatedCredentialId !== input.delegatedCredentialId
    || permission.policy.generationRef !== selected.generationRef
    || permission.policy.routes[0]?.routePlanId !== selected.selectedRoute.routePlanId) {
    return projectNeedsAttention({
      requestRef: input.requestRef,
      revision: input.revision,
      summary: 'This repeat permission does not apply to the current choice.',
    })
  }
  const result = await ports.issueMandate({
    requestId: input.requestRef,
    policyRef: permission.policy.policyRef,
    expectedPolicyDigest: permission.policy.policyDigest,
    expectedRequestRevision: input.revision,
    expectedGenerationRef: selected.generationRef,
    selectedRoutePlanId: selected.selectedRoute.routePlanId,
    delegatedCredentialId: input.delegatedCredentialId,
    mandateExpiresAt: Math.min(selected.displayedRoute.validUntil, permission.policy.validUntil),
    idempotencyKey: input.idempotencyKey,
    ...(input.serviceAuthorization === undefined ? {} : {
      serviceAuthorization: input.serviceAuthorization,
    }),
  })
  if (result.kind === 'issued' || result.kind === 'replayed') {
    return projectConfirmedRoute(
      current.aggregate, selected.displayedRoute, result.mandate,
    )
  }
  if (result.kind === 'conflict') {
    return result.reason === 'command_changed'
      ? { kind: 'conflict', requestRef: input.requestRef, reason: 'idempotency_key_reused' }
      : { kind: 'conflict', requestRef: input.requestRef, reason: 'options_changed' }
  }
  if ('reason' in result) {
    return projectNeedsAttention({
      requestRef: input.requestRef,
      revision: input.revision,
      summary: repeatPermissionUseRecoverySummary(result.reason),
    })
  }
  return projectConfirmedRoute(
    current.aggregate, selected.displayedRoute, result.mandate,
  )
}
