import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorLayoutRouteOptions } from '@/lib/operator/route-options'
import { resolveOperatorNavItem } from '@/lib/operator/navigation'
import { operatorSurfaceForPath } from '@/lib/operator/operator-context'

export const Route = createFileRoute('/_operator')({
  ...operatorLayoutRouteOptions,
  component: OperatorLayoutRoute,
})

function OperatorLayoutRoute() {
  const { pathname } = useLocation()
  const operatorContext = Route.useRouteContext()
  const operatorRole = operatorSurfaceForPath(pathname)
  const navItem = resolveOperatorNavItem(operatorRole, pathname)

  return (
    <AeOperatorShell
      operatorRole={operatorRole}
      operatorContext={operatorContext}
      title={navItem?.label ?? 'Workspace'}
      description="Loading your latest marketplace activity."
      currentPath={pathname}
    >
      <Outlet />
    </AeOperatorShell>
  )
}
