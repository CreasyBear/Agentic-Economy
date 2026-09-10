import { ArrowLeftIcon } from 'lucide-react'
import { Link, useLocation, useRouter } from '@tanstack/react-router'
import { SignOutButton } from '@clerk/tanstack-react-start'
import { useRef, useState } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeNotFound } from '@/components/ae/layout/AeNotFound'
import { AeOperatorPage, useOperatorShellChrome } from '@/components/ae/layout/AeOperatorPage'
import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { operatorRoleForPath, roleHomeHref } from '@/lib/operator/navigation'
import {
  OPERATOR_SURFACE_FORBIDDEN_MESSAGE,
  OperatorSurfaceForbiddenError,
} from '@/lib/operator/operator-context'

/**
 * One pending/error/not-found family shared by public routes (defaults in
 * src/router.tsx) and operator routes (src/lib/operator/route-options.ts).
 * The Operator* exports render INSIDE the operator shell so a slow or failed
 * load never drops the sidebar/breadcrumb chrome; they wrap in AeOperatorPage
 * only when not already nested under one (detected via
 * useOperatorShellChrome). A plain pathname check can't stand in for that
 * flag: operator-owned paths like /agent-access/* don't match
 * operatorRoleForPath, so the two families stay separate thin exports over
 * shared helpers rather than one auto-detecting component.
 */

export function RoutePending({
  title = 'Loading page',
  description = 'Loading the latest available information.',
}: { title?: string; description?: string } = {}) {
  return <AePageSkeleton title={title} description={description} />
}

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
    <AeOperatorPage
      operatorRole={operatorRoleForPath(pathname) ?? 'owner'}
      title="Loading workspace"
      description="Fetching the latest marketplace and account details."
      currentPath={pathname}
      pending
    >
      {body}
    </AeOperatorPage>
  )
}

function RouteErrorState({ error, operator }: { error: unknown; operator: boolean }) {
  const { pathname } = useLocation()
  const router = useRouter()
  const retryLock = useRef(false)
  const [retryPending, setRetryPending] = useState(false)
  const parentShell = useOperatorShellChrome()
  const correlationRef = errorCorrelationRef(error)

  if (isOperatorSurfaceForbidden(error)) {
    if (!operator || parentShell !== null) return <OperatorForbiddenBody />
    return (
      <AeOperatorPage
        operatorRole={operatorRoleForPath(pathname) ?? 'owner'}
        title="You don’t have access"
        description="This signed-in account cannot open the requested workspace."
        currentPath={pathname}
        suppressSurfaceNavigation
      >
        <OperatorForbiddenBody />
      </AeOperatorPage>
    )
  }

  if (!operator) {
    const actions = (
      <div className="grid w-full gap-related">
        <div className="flex w-full flex-col gap-intra sm:flex-row">
          <Button
            type="button"
            className="min-h-touch w-full sm:w-auto"
            disabled={retryPending}
            aria-busy={retryPending || undefined}
            onClick={() => {
              if (retryLock.current) return
              retryLock.current = true
              setRetryPending(true)
              void router.invalidate()
                .catch((cause) => captureClientExceptionOnClient(cause))
                .finally(() => {
                  retryLock.current = false
                  setRetryPending(false)
                })
            }}
          >
            {retryPending ? 'Trying again…' : 'Try again'}
          </Button>
          <Button asChild variant="secondary" className="min-h-touch w-full sm:w-auto">
            <Link to="/status">Check system status</Link>
          </Button>
        </div>
        {correlationRef === undefined ? null : (
          <div className="grid gap-1 text-sm text-muted-foreground">
            <span>Support reference</span>
            <AeCopyReference label="support reference" value={correlationRef} />
          </div>
        )}
      </div>
    )

    return (
      <AePageState
        state="unavailable"
        title="Couldn’t load this page"
        description="The current source could not be reached. No newer state is claimed."
        action={actions}
      />
    )
  }

  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'
  const body = (
    <Alert variant="destructive">
      <AlertTitle>Couldn’t load this page</AlertTitle>
      <AlertDescription>
        <p>Try loading it again. If it still fails, check system status before repeating a Call.</p>
        {correlationRef === undefined
          ? null
          : <AeCopyReference label="support reference" value={correlationRef} />}
        <div className="flex w-full flex-wrap gap-intra">
          <Button
            type="button"
            className="min-h-touch"
            disabled={retryPending}
            aria-busy={retryPending || undefined}
            onClick={() => {
              if (retryPending) return
              setRetryPending(true)
              void router.invalidate()
                .catch((cause) => captureClientExceptionOnClient(cause))
                .finally(() => setRetryPending(false))
            }}
          >
            {retryPending ? 'Trying again…' : 'Try again'}
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
    <AeOperatorPage
      operatorRole={operatorRole}
      title="Couldn’t load this page"
      description="Try again, then check system status if the page still does not load."
      currentPath={pathname}
    >
      {body}
    </AeOperatorPage>
  )
}

export function RouteError({ error }: { error: unknown }) {
  return <RouteErrorState error={error} operator={false} />
}

export function OperatorRouteError({ error }: { error: unknown }) {
  return <RouteErrorState error={error} operator={true} />
}

export function errorCorrelationRef(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  for (const key of ['correlationRef', 'correlationId'] as const) {
    const value = Reflect.get(error, key)
    if (typeof value !== 'string') continue
    const bounded = value.trim()
    if (bounded.length > 0 && bounded.length <= 200) return bounded
  }
  return undefined
}

function OperatorForbiddenBody() {
  const localE2E = isLocalE2EAuthBypassEnabled()
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
          {localE2E ? (
            <Button asChild variant="outline" className="min-h-touch">
              <Link to="/">Return home</Link>
            </Button>
          ) : (
            <SignOutButton redirectUrl="/">
              <Button type="button" variant="outline" className="min-h-touch">Sign out</Button>
            </SignOutButton>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}

export function isOperatorSurfaceForbidden(error: unknown): boolean {
  if (error instanceof OperatorSurfaceForbiddenError) return true
  if (typeof error !== 'object' || error === null) return false
  return Reflect.get(error, 'code') === 'operator_surface_forbidden'
    || Reflect.get(error, 'message') === OPERATOR_SURFACE_FORBIDDEN_MESSAGE
}

export function RouteNotFound() {
  return <AeNotFound />
}

export function OperatorRouteNotFound() {
  const { pathname } = useLocation()
  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'
  const isAssistantAccessPath = pathname.startsWith('/agent-access/')
  const recoveryHref = isAssistantAccessPath ? '/agent-access' : roleHomeHref[operatorRole]
  const recoveryLabel = isAssistantAccessPath ? 'Back to Agents' : 'Back to workspace'

  return (
    <AeOperatorPage
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
    </AeOperatorPage>
  )
}
