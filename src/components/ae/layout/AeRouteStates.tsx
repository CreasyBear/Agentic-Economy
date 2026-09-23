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
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { operatorRoleForPath, roleHomeHref } from '@/lib/operator/roles'
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

export type OperatorRouteSkeletonPreset =
  | 'default'
  | 'table'
  | 'overview-cards'
  | 'split-console'
  | 'form-record'

const OVERVIEW_CARD_PATHS = new Set(['/owner', '/owner/workspace', '/owner/market'])

export function inferOperatorSkeletonPreset(pathname: string): OperatorRouteSkeletonPreset {
  if (OVERVIEW_CARD_PATHS.has(pathname)) return 'overview-cards'

  if (pathname.includes('/settings') || pathname.endsWith('/new')) return 'form-record'

  if (
    pathname.includes('/activity')
    || (pathname.includes('/operations') && !pathname.includes('/new'))
    || pathname.includes('/credit')
    || pathname.includes('/table')
  ) {
    return 'table'
  }

  if (pathname.includes('/console') || pathname.includes('/t/')) return 'split-console'

  return 'default'
}

function TableSkeleton() {
  return (
    <div className="grid gap-related">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full rounded-md" />
      <div
        data-testid="skeleton-table"
        className="min-h-[14rem] overflow-hidden rounded-lg border border-border bg-card/40"
      >
        <div className="grid grid-cols-4 gap-gutter border-b border-border p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={`header-${index}`} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: 5 }, (_, rowIndex) => (
          <div
            key={rowIndex}
            data-testid="skeleton-table-row"
            className="grid grid-cols-4 gap-gutter border-b border-border p-4 last:border-b-0"
          >
            {Array.from({ length: 4 }, (_, colIndex) => (
              <Skeleton
                key={`${rowIndex}-${colIndex}`}
                className="h-touch w-full"
                data-testid="skeleton-table-cell"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function OverviewCardsSkeleton() {
  return (
    <div className="grid gap-related">
      <div className="grid gap-intra">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-60" />
      </div>
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            data-testid="skeleton-metric-card"
            className="h-32 rounded-xl border border-border bg-card/60 p-4"
          >
            <Skeleton className="mb-3 h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      <div
        data-testid="skeleton-overview-primary"
        className="h-64 rounded-xl border border-border bg-card/40"
      />
    </div>
  )
}

function SplitConsoleSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div
        data-testid="skeleton-split-rail"
        className="h-96 rounded-xl border border-border p-4"
      >
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="h-touch w-full" />
        <Skeleton className="mt-intra h-touch w-full" />
      </div>
      <div
        data-testid="skeleton-split-panel"
        className="h-96 rounded-xl border border-border p-6"
      >
        <Skeleton className="mb-4 h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="mt-intra h-touch w-full" />
      </div>
    </div>
  )
}

function FormRecordSkeleton() {
  return (
    <div className="grid max-w-2xl gap-section">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} data-testid="skeleton-form-field" className="grid gap-intra">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
      <Skeleton data-testid="skeleton-form-action" className="h-10 w-32 rounded-md" />
    </div>
  )
}

function DefaultSkeleton() {
  return (
    <div data-testid="skeleton-default-body" className="grid gap-related">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-touch w-full" />
      ))}
    </div>
  )
}

export function OperatorRoutePending({
  preset,
}: { preset?: OperatorRouteSkeletonPreset } = {}) {
  const { pathname } = useLocation()
  const parentShell = useOperatorShellChrome()
  const resolvedPreset = preset ?? inferOperatorSkeletonPreset(pathname)

  const body = (
    <div
      className="grid gap-related"
      aria-busy="true"
      aria-label="Loading workspace"
      data-skeleton-preset={resolvedPreset}
    >
      {resolvedPreset === 'table' && <TableSkeleton />}
      {resolvedPreset === 'overview-cards' && <OverviewCardsSkeleton />}
      {resolvedPreset === 'split-console' && <SplitConsoleSkeleton />}
      {resolvedPreset === 'form-record' && <FormRecordSkeleton />}
      {resolvedPreset === 'default' && <DefaultSkeleton />}
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
      <Link
        to={recoveryHref}
        className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch w-fit')}
      >
        <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
        {recoveryLabel}
      </Link>
    </AeOperatorPage>
  )
}
