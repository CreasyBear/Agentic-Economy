import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { operatorLayoutRouteOptions } from '@/lib/operator/route-options'
import { operatorSurfaceForPath } from '@/lib/operator/operator-context'

export const Route = createFileRoute('/_operator')({
  ...operatorLayoutRouteOptions,
  component: OperatorLayoutRoute,
})

function OperatorLayoutRoute() {
  const { pathname } = useLocation()
  const operatorContext = Route.useRouteContext()
  const operatorRole = operatorSurfaceForPath(pathname)

  return (
    <OperatorChromeProvider
      sidebar={
        <>
          <SidebarTrigger
            aria-label="Open operator navigation"
            className="fixed start-gutter top-[calc(var(--header-height)+var(--spacing-intra))] z-20 border border-border bg-background shadow-soft md:hidden"
          />
          <AeOperatorSidebar
            operatorRole={operatorRole}
            operatorContext={operatorContext}
            currentPath={pathname}
            className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
          />
        </>
      }
    >
      <Outlet />
    </OperatorChromeProvider>
  )
}
