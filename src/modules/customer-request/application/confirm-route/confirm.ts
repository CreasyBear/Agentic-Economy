import { projectNeedsAttention } from '@/modules/customer-request/customer-projection'

import { projectConfirmedRoute } from '../route-plan-projection/project-aggregate'
import { resolveSelectableCurrentRoute } from '../standing-route/select'
import type {
  ConfirmRouteInput,
  ConfirmRoutePorts,
  ConfirmRouteResult,
} from './types'

export async function confirmCustomerRoute(
  input: ConfirmRouteInput,
  ports: ConfirmRoutePorts,
): Promise<ConfirmRouteResult> {
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
  if (selected.kind !== 'selected') return selected.preview
  if (selected.displayedRoute.maximumTotalCost.kind !== 'known') return selected.preview
  const result = await ports.issueConfirmMandate({
    requestId: input.requestRef,
    expectedRequestRevision: input.revision,
    expectedGenerationRef: selected.generationRef,
    selectedRoutePlanId: selected.selectedRoute.routePlanId,
    maximumTotalSpend: {
      currency: selected.displayedRoute.maximumTotalCost.currency,
      amountMinor: selected.displayedRoute.maximumTotalCost.amountMinor,
    },
    expiresAt: selected.displayedRoute.validUntil,
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
    if (result.reason === 'command_changed') {
      return {
        kind: 'conflict', requestRef: input.requestRef, reason: 'idempotency_key_reused',
      }
    }
    if (result.reason === 'request_revision_changed') {
      return {
        kind: 'conflict', requestRef: input.requestRef, reason: 'revision_changed',
      }
    }
    if (result.reason === 'route_generation_changed') {
      return await ports.projectCurrentRoutePlans(current.aggregate)
    }
    return { kind: 'conflict', requestRef: input.requestRef, reason: 'options_changed' }
  }
  if ('reason' in result) {
    return projectNeedsAttention({
      requestRef: input.requestRef, revision: input.revision,
      summary: result.reason === 'authentication_required'
        ? 'Sign in again before confirming this choice.'
        : 'This choice can no longer be confirmed. Review the current options.',
    })
  }
  return projectConfirmedRoute(
    current.aggregate, selected.displayedRoute, result.mandate,
  )
}
