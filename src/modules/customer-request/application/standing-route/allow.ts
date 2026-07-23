import { projectRepeatPermission } from './project'
import { resolveSelectableCurrentRoute } from './select'
import type {
  AllowStandingRouteInput,
  RepeatPermissionResult,
  StandingRoutePorts,
} from './types'

export async function allowStandingRoute(
  input: AllowStandingRouteInput,
  ports: StandingRoutePorts,
): Promise<RepeatPermissionResult> {
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
    requireKnownMaximumTotalCost: true,
  }, ports)
  if (selected.kind !== 'selected') {
    return {
      kind: 'unavailable',
      reason: 'choice_not_current',
      summary: selected.reason === 'preview_unavailable'
        ? 'Review the current choices before allowing repeats.'
        : 'This choice is no longer current. Review the available choices.',
    }
  }
  if (selected.displayedRoute.maximumTotalCost.kind !== 'known') {
    return {
      kind: 'unavailable',
      reason: 'choice_not_current',
      summary: 'This choice is no longer current. Review the available choices.',
    }
  }
  const perUseDataAllocations = selected.selectedRoute.steps.reduce(
    (total, step) => total + step.dataUse.length,
    0,
  )
  const result = await ports.issueStandingPolicy({
    requestId: input.requestRef,
    expectedRequestRevision: input.revision,
    expectedGenerationRef: selected.generationRef,
    selectedRoutePlanId: selected.selectedRoute.routePlanId,
    delegatedCredentialId: input.delegatedCredentialId,
    perUseSpend: {
      currency: selected.displayedRoute.maximumTotalCost.currency,
      amountMinor: selected.displayedRoute.maximumTotalCost.amountMinor,
    },
    cumulativeSpend: input.cumulativeSpend,
    perUseDataAllocations,
    cumulativeDataAllocations: perUseDataAllocations * input.occurrences,
    occurrences: input.occurrences,
    validUntil: input.validUntil,
    idempotencyKey: input.idempotencyKey,
    ...(input.serviceAuthorization === undefined ? {} : {
      serviceAuthorization: input.serviceAuthorization,
    }),
  })
  if (result.kind === 'issued' || result.kind === 'replayed') {
    return projectRepeatPermission(
      input.requestRef, input.revision, input.routeRef, result.policy,
    )
  }
  if (result.kind === 'conflict') {
    return result.reason === 'command_changed'
      ? { kind: 'conflict', requestRef: input.requestRef, reason: 'idempotency_key_reused' }
      : { kind: 'conflict', requestRef: input.requestRef, reason: 'options_changed' }
  }
  if (result.kind === 'refused') {
    return {
      kind: 'unavailable',
      reason: result.reason === 'credential_not_authorized'
        ? 'credential_not_authorized'
        : 'repeat_permission_not_available',
      summary: result.reason === 'credential_not_authorized'
        ? 'That assistant is not authorized for repeat permission.'
        : 'Repeat permission is not available for this choice.',
    }
  }
  throw new Error('customer_request_standing_route_policy_result_unreachable')
}
