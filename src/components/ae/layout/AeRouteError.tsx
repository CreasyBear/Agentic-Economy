import { SignOutButton } from '@clerk/tanstack-react-start'
import { Link, useLocation, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeOperatorPage, useOperatorShellChrome } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import {
  OPERATOR_SURFACE_FORBIDDEN_MESSAGE,
  OperatorSurfaceForbiddenError,
} from '@/lib/operator/operator-context'
import { operatorRoleForPath } from '@/lib/operator/roles'
import { cn } from '@/lib/utils'

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
          <Link
            to="/status"
            className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch w-full sm:w-auto')}
          >
            Check system status
          </Link>
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
          <Link
            to="/status"
            className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}
          >
            Check system status
          </Link>
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
  return (
    <Alert>
      <AlertTitle>You don’t have access to this workspace</AlertTitle>
      <AlertDescription>
        <p>Use the account that owns this workspace, or return to the public market.</p>
        <div className="flex w-full flex-wrap gap-intra">
          <Link to="/market" className={cn(buttonVariants(), 'min-h-touch')}>
            Return to market
          </Link>
          <Link to="/support" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>
            Help
          </Link>
          <SignOutButton redirectUrl="/">
            <Button type="button" variant="outline" className="min-h-touch">Sign out</Button>
          </SignOutButton>
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
