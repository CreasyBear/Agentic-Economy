import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import { WorkspaceTransitionBoundary } from '@/components/ae/layout/WorkspaceTransitionBoundary'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { operatorLayoutRouteOptions } from '@/lib/operator/route-options'
import { operatorSurfaceForPath } from '@/lib/operator/operator-context'
import { shouldMountOperatorSidebar } from '@/lib/operator/roles'

export const Route = createFileRoute('/_operator')({
  staticData: { shell: 'operator' },
  ...operatorLayoutRouteOptions,
  component: OperatorLayoutRoute,
})

function OperatorLayoutRoute() {
  const { pathname } = useLocation()
  const operatorContext = Route.useRouteContext()
  const operatorRole = operatorSurfaceForPath(pathname)
  const mountSidebar = shouldMountOperatorSidebar(operatorRole, pathname)
  const slimSidebarChrome = operatorRole === 'admin' || operatorRole === 'developer'

  return (
    <SidebarProvider className="contents" defaultOpen>
      <OperatorChromeProvider
        mobileTrigger={
          mountSidebar
            ? <SidebarTrigger aria-label="Open operator navigation" className="md:hidden" />
            : undefined
        }
        sidebar={
          mountSidebar
            ? (
                <AeOperatorSidebar
                  operatorRole={operatorRole}
                  operatorContext={operatorContext}
                  currentPath={pathname}
                  slimChrome={slimSidebarChrome}
                  className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
                />
              )
            : undefined
        }
      >
        <WorkspaceTransitionBoundary>
          <Outlet />
        </WorkspaceTransitionBoundary>
      </OperatorChromeProvider>
    </SidebarProvider>
  )
}
