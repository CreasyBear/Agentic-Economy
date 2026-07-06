import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorLayoutRouteOptions } from '@/lib/operator/route-options'
import { operatorRoleForPath } from '@/lib/operator/navigation'

export const Route = createFileRoute('/_operator')({
  ...operatorLayoutRouteOptions,
  component: OperatorLayoutRoute,
})

function OperatorLayoutRoute() {
  const { pathname } = useLocation()
  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'

  return (
    <AeOperatorShell
      operatorRole={operatorRole}
      title="Operator workspace"
      description="Loading the latest operator view."
      currentPath={pathname}
    >
      <Outlet />
    </AeOperatorShell>
  )
}
