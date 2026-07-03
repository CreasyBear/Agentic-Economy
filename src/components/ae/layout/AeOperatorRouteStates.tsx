import { useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Banner } from '@astryxdesign/core/Banner'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { operatorRoleForPath } from '@/lib/operator/navigation'

/**
 * Shared pendingComponent/errorComponent for every /owner, /admin, and
 * /developers route (see src/lib/operator/route-options.ts). Rendered
 * INSIDE the operator shell so a slow or failed load never drops the
 * sidebar/breadcrumb chrome.
 */
export function OperatorRoutePending() {
  const { pathname } = useLocation()

  return (
    <AeOperatorShell
      operatorRole={operatorRoleForPath(pathname) ?? 'owner'}
      title="Loading"
      description="Fetching the latest state for this page."
      currentPath={pathname}
    >
      <div className="grid gap-3">
        <Skeleton height="6rem" width="100%" index={0} />
        <Skeleton height="6rem" width="100%" index={1} />
        <Skeleton height="6rem" width="100%" index={2} />
      </div>
    </AeOperatorShell>
  )
}

export function OperatorRouteError({ error }: { error: unknown }) {
  const { pathname } = useLocation()
  const message = error instanceof Error ? error.message : 'This page could not load right now.'

  return (
    <AeOperatorShell
      operatorRole={operatorRoleForPath(pathname) ?? 'owner'}
      title="Page error"
      description="Something went wrong loading this page."
      currentPath={pathname}
    >
      <Banner
        status="error"
        title="Unable to load this page"
        description={message}
      />
    </AeOperatorShell>
  )
}
