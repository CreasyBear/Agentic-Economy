import { Outlet, createFileRoute } from '@tanstack/react-router'

import { OperatorRouteForbidden } from '@/components/ae/layout/AeRouteError'
import { WorkspaceTransitionBoundary } from '@/components/ae/layout/WorkspaceTransitionBoundary'
import { operatorLayoutRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator')({
  staticData: { shell: 'operator' },
  ...operatorLayoutRouteOptions,
  component: OperatorLayoutRoute,
})

function OperatorLayoutRoute() {
  const operatorContext = Route.useRouteContext()
  if (operatorContext.kind === 'forbidden') {
    return <OperatorRouteForbidden surface={operatorContext.surface} />
  }

  return (
    <WorkspaceTransitionBoundary>
      <Outlet />
    </WorkspaceTransitionBoundary>
  )
}
