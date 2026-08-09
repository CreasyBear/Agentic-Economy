import { ArrowLeftIcon } from 'lucide-react'
import { useLocation } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { operatorRoleForPath, roleHomeHref } from '@/lib/operator/navigation'

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
      title="Getting things ready"
      description="Loading the latest details so you can continue."
      currentPath={pathname}
    >
      <div className="grid gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </AeOperatorShell>
  )
}

export function OperatorRouteError({ error: _error }: { error: unknown }) {
  const { pathname } = useLocation()

  return (
    <AeOperatorShell
      operatorRole={operatorRoleForPath(pathname) ?? 'owner'}
      title="This page is unavailable"
      description="We could not load the latest details. Try again."
      currentPath={pathname}
    >
      <Alert variant="destructive">
        <AlertTitle>Unable to load this page</AlertTitle>
        <AlertDescription>The latest details could not be loaded. Refresh the page to try again.</AlertDescription>
      </Alert>
    </AeOperatorShell>
  )
}

export function OperatorRouteNotFound() {
  const { pathname } = useLocation()
  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'
  const isAssistantAccessPath = pathname.startsWith('/agent-access/')
  const recoveryHref = isAssistantAccessPath ? '/agent-access' : roleHomeHref[operatorRole]
  const recoveryLabel = isAssistantAccessPath ? 'Back to assistant access' : 'Back to operator home'

  return (
    <AeOperatorShell
      operatorRole={operatorRole}
      title="Page not found"
      description="This operator page does not exist or may have moved."
      currentPath={pathname}
    >
      <Button asChild variant="secondary" className="min-h-11 w-fit">
        <a href={recoveryHref}>
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          {recoveryLabel}
        </a>
      </Button>
    </AeOperatorShell>
  )
}
