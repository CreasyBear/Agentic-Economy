import { ArrowLeftIcon } from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'
import { SignOutButton } from '@clerk/tanstack-react-start'

import { AeOperatorShell, useOperatorShellChrome } from '@/components/ae/layout/AeOperatorShell'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { operatorRoleForPath, roleHomeHref } from '@/lib/operator/navigation'
import { OperatorSurfaceForbiddenError } from '@/lib/operator/operator-context'

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

export function OperatorRouteError({ error }: { error: unknown }) {
  const { pathname } = useLocation()
  const parentShell = useOperatorShellChrome()
  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'
  const correlationRef = operatorErrorCorrelationRef(error)

  if (isOperatorSurfaceForbidden(error)) {
    if (parentShell !== null) return <OperatorForbiddenBody />
    return (
      <AeOperatorShell
        operatorRole={operatorRole}
        title="You don’t have access"
        description="This signed-in account cannot open the requested workspace."
        currentPath={pathname}
      >
        <OperatorForbiddenBody />
      </AeOperatorShell>
    )
  }

  const body = (
    <Alert variant="destructive">
      <AlertTitle>Couldn’t load this page</AlertTitle>
      <AlertDescription>
        <p>Try loading it again. If it still fails, check system status before repeating an Operation call.</p>
        {correlationRef === undefined
          ? null
          : <AeCopyReference label="support reference" value={correlationRef} />}
        <div className="flex w-full flex-wrap gap-intra">
          <Button type="button" className="min-h-touch" onClick={() => window.location.reload()}>
            Try again
          </Button>
          <Button asChild variant="secondary" className="min-h-touch">
            <Link to="/status">Check system status</Link>
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

function operatorErrorCorrelationRef(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  for (const key of ['correlationRef', 'correlationId'] as const) {
    const value = Reflect.get(error, key)
    if (typeof value === 'string' && value.trim().length > 0 && value.length <= 200) {
      return value
    }
  }
  return undefined
}

function OperatorForbiddenBody() {
  return (
    <Alert>
      <AlertTitle>You don’t have access to this workspace</AlertTitle>
      <AlertDescription>
        <p>Use the account that owns this workspace, or return to the public market.</p>
        <div className="flex w-full flex-wrap gap-intra">
          <Button asChild type="button" className="min-h-touch">
            <Link to="/market" search={{ window: '30d' }}>Return to market</Link>
          </Button>
          <Button asChild variant="secondary" className="min-h-touch">
            <Link to="/support">Get help</Link>
          </Button>
          <SignOutButton redirectUrl="/">
            <Button type="button" variant="outline" className="min-h-touch">Sign out</Button>
          </SignOutButton>
        </div>
      </AlertDescription>
    </Alert>
  )
}

function isOperatorSurfaceForbidden(error: unknown): boolean {
  if (error instanceof OperatorSurfaceForbiddenError) return true
  if (typeof error !== 'object' || error === null) return false
  return Reflect.get(error, 'code') === 'operator_surface_forbidden'
}

export function OperatorRouteNotFound() {
  const { pathname } = useLocation()
  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'
  const isAssistantAccessPath = pathname.startsWith('/agent-access/')
  const recoveryHref = isAssistantAccessPath ? '/agent-access' : roleHomeHref[operatorRole]
  const recoveryLabel = isAssistantAccessPath ? 'Back to Agents' : 'Back to workspace'

  return (
    <AeOperatorShell
      operatorRole={operatorRole}
      title="Page not found"
      description="This page may have moved, or your account may not have access."
      currentPath={pathname}
    >
      <Button asChild variant="secondary" className="min-h-touch w-fit">
        <Link to={recoveryHref}>
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          {recoveryLabel}
        </Link>
      </Button>
    </AeOperatorShell>
  )
}
