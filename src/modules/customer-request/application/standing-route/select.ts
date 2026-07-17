import { customerRouteRef } from '@/modules/customer-request/route-plan-customer-projection'

import type {
  SelectableCurrentRouteResult,
  StandingRouteAggregate,
  StandingRoutePorts,
} from './types'

export async function resolveSelectableCurrentRoute(
  input: Readonly<{
    requestRef: string
    routeRef: string
    aggregate: StandingRouteAggregate
    requireKnownMaximumTotalCost: boolean
  }>,
  ports: Pick<StandingRoutePorts, 'projectCurrentRoutePlans' | 'getCurrentRoutePlanGeneration'>,
): Promise<SelectableCurrentRouteResult> {
  const preview = await ports.projectCurrentRoutePlans(input.aggregate)
  if (preview.kind !== 'request' || preview.decision?.outcome.kind !== 'routes_available') {
    return { kind: 'not_selectable', preview, reason: 'preview_unavailable' }
  }
  const displayedRoute = preview.decision.routes.find(({ routeRef }) => routeRef === input.routeRef)
  if (displayedRoute?.availability !== 'current'
    || (input.requireKnownMaximumTotalCost && displayedRoute.maximumTotalCost.kind !== 'known')) {
    return { kind: 'not_selectable', preview, reason: 'route_not_current' }
  }
  const routeReadback = await ports.getCurrentRoutePlanGeneration({
    requestId: input.requestRef,
  })
  const selectedRoute = routeReadback.kind === 'found'
    ? routeReadback.routeGeneration.routes.find(({ routePlanId }) => (
        customerRouteRef(preview.decision?.generationRef ?? '', routePlanId) === input.routeRef
      ))
    : undefined
  if (selectedRoute === undefined) {
    return { kind: 'not_selectable', preview, reason: 'route_missing' }
  }
  return {
    kind: 'selected',
    preview: preview as Extract<SelectableCurrentRouteResult, { kind: 'selected' }>['preview'],
    displayedRoute,
    selectedRoute,
    generationRef: preview.decision.generationRef,
  }
}
