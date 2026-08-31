import { ArrowLeftIcon } from 'lucide-react'
import { useLocation } from '@tanstack/react-router'

import { AeOperatorShell, useOperatorShellChrome } from '@/components/ae/layout/AeOperatorShell'
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
  const parentShell = useOperatorShellChrome()

  const body = (
    <div className="grid gap-intra" aria-busy="true" aria-label="Loading workspace">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-touch w-full" />
      ))}
    </div>
  )

  if (parentShell !== null) return body

  return (
    <AeOperatorShell
      operatorRole={operatorRoleForPath(pathname) ?? 'owner'}
      title="Loading workspace"
      description="Fetching the latest marketplace and account details."
      currentPath={pathname}
    >
      {body}
    </AeOperatorShell>
  )
}

export function OperatorRouteError({ error: _error }: { error: unknown }) {
  const { pathname } = useLocation()
  const parentShell = useOperatorShellChrome()
  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'

  const body = (
    <Alert variant="destructive">
      <AlertTitle>Couldn’t load this page</AlertTitle>
      <AlertDescription>
        <p>Try loading it again. If it still fails, check system status before repeating an Operation call.</p>
        <div className="flex w-full flex-wrap gap-intra">
          <Button type="button" className="min-h-touch" onClick={() => window.location.reload()}>
            Try again
          </Button>
          <Button asChild variant="secondary" className="min-h-touch">
            <a href="/status">Check system status</a>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )

  if (parentShell !== null) return body

  return (
    <AeOperatorShell
      operatorRole={operatorRole}
      title="Couldn’t load this page"
      description="Try again, then check system status if the page still does not load."
      currentPath={pathname}
    >
      {body}
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
      <Button asChild variant="secondary" className="min-h-touch w-fit">
        <a href={recoveryHref}>
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          {recoveryLabel}
        </a>
      </Button>
    </AeOperatorShell>
  )
}
