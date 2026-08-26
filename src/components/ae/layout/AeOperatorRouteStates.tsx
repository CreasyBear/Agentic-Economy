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
      title="Loading workspace"
      description="Fetching the latest marketplace and account details."
      currentPath={pathname}
    >
      <div className="grid gap-2" aria-busy="true" aria-label="Loading workspace">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </AeOperatorShell>
  )
}

export function OperatorRouteError({ error: _error }: { error: unknown }) {
  const { pathname } = useLocation()

  return (
    <AeOperatorShell
      operatorRole={operatorRoleForPath(pathname) ?? 'owner'}
      title="Couldn’t load this page"
      description="Try again. Your account and access settings are unchanged."
      currentPath={pathname}
    >
      <Alert variant="destructive">
        <AlertTitle>Workspace unavailable</AlertTitle>
        <AlertDescription>Refresh the page to try again. If the problem continues, return to your workspace home.</AlertDescription>
      </Alert>
    </AeOperatorShell>
  )
}

export function OperatorRouteNotFound() {
  const { pathname } = useLocation()
  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'
  const isAssistantAccessPath = pathname.startsWith('/agent-access/')
  const recoveryHref = isAssistantAccessPath ? '/agent-access' : roleHomeHref[operatorRole]
  const recoveryLabel = isAssistantAccessPath ? 'Back to Keys' : 'Back to workspace'

  return (
    <AeOperatorShell
      operatorRole={operatorRole}
      title="Page not found"
      description="This page may have moved, or your account may not have access."
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
