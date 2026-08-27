import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorLayoutRouteOptions } from '@/lib/operator/route-options'
import { operatorRoleForPath, resolveOperatorNavItem } from '@/lib/operator/navigation'

export const Route = createFileRoute('/_operator')({
  ...operatorLayoutRouteOptions,
  component: OperatorLayoutRoute,
})

function OperatorLayoutRoute() {
  const { pathname } = useLocation()
  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'
  const navItem = resolveOperatorNavItem(operatorRole, pathname)

  return (
    <AeOperatorShell
      operatorRole={operatorRole}
      title={navItem?.label ?? 'Workspace'}
      description="Loading your latest marketplace activity."
      currentPath={pathname}
    >
      <Outlet />
    </AeOperatorShell>
  )
}
