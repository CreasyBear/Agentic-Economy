import { SignOutButton } from '@clerk/tanstack-react-start'
import { Link, useLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeOperatorPage, useOperatorShellChrome } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/arc/button/button'
import { operatorForbiddenCopy } from '@/components/ae/layout/route-error.contracts'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { attemptViteStaleChunkReload, isViteStaleChunkError } from '@/lib/observability/stale-chunk-reload'
import {
  OPERATOR_SURFACE_FORBIDDEN_MESSAGE,
  OperatorSurfaceForbiddenError,
  type OperatorSurface,
} from '@/lib/operator/operator-context'
import { operatorRoleForPath } from '@/lib/operator/roles'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './RouteRecoveryComposition.css'

function RouteErrorState({ error, operator }: { error: unknown; operator: boolean }) {
  const { pathname } = useLocation()
  const router = useRouter()
  const retryLock = useRef(false)
  const [retryPending, setRetryPending] = useState(false)
  const parentShell = useOperatorShellChrome()
  const correlationRef = errorCorrelationRef(error)
  const recoveryCopy = 'Try again, or check system status.'

  // The router catches asset-loading failures before the outer render boundary.
  useEffect(() => {
    attemptViteStaleChunkReload(error)
  }, [error])

  if (isOperatorSurfaceForbidden(error)) {
    const surface = error instanceof OperatorSurfaceForbiddenError
      ? error.surface
      : (operatorRoleForPath(pathname) ?? 'owner')
    return operator ? <OperatorRouteForbidden surface={surface} /> : <OperatorForbiddenActions surface={surface} />
  }

  if (!operator) {
    const actions = (
      <div className="arc-market arc-recovery-actions">
        <div className="arc-recovery-action-row">
          <Button
            type="button"
            size="md"
            disabled={retryPending}
            aria-busy={retryPending || undefined}
            onClick={() => {
              if (retryLock.current) return
              retryLock.current = true
              setRetryPending(true)
              if (isViteStaleChunkError(error)) {
                window.location.reload()
                return
              }
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
            className={actionLinkClassName('secondary', 'md')}
          >
            Check system status
          </Link>
        </div>
        {correlationRef === undefined ? null : (
          <div className="arc-recovery-reference">
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
        description={`The page could not be loaded. ${recoveryCopy}`}
        action={actions}
      />
    )
  }

  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'
  const body = (
    <Alert variant="destructive" className="arc-market arc-recovery-alert">
      {parentShell === null ? null : <AlertTitle>Couldn’t load this page</AlertTitle>}
      <AlertDescription>
        <p>{recoveryCopy}</p>
        {correlationRef === undefined
          ? null
          : <AeCopyReference label="support reference" value={correlationRef} />}
        <div className="arc-recovery-action-row">
          <Button
            type="button"
            size="md"
            disabled={retryPending}
            aria-busy={retryPending || undefined}
            onClick={() => {
              if (retryLock.current) return
              retryLock.current = true
              setRetryPending(true)
              if (isViteStaleChunkError(error)) {
                window.location.reload()
                return
              }
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
            className={actionLinkClassName('secondary', 'md')}
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
      description={recoveryCopy}
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

export type OperatorRouteForbiddenProps = Readonly<{
  surface: OperatorSurface
}>

export function OperatorRouteForbidden({ surface }: OperatorRouteForbiddenProps) {
  const { pathname } = useLocation()
  const copy = operatorForbiddenCopy[surface]
  return (
    <AeOperatorPage
      operatorRole={surface}
      title={copy.title}
      description={copy.description}
      currentPath={pathname}
      suppressSurfaceNavigation
    >
      <OperatorForbiddenActions surface={surface} />
    </AeOperatorPage>
  )
}

function OperatorForbiddenActions({ surface }: OperatorRouteForbiddenProps) {
  const copy = operatorForbiddenCopy[surface]
  return (
    <div className="arc-market arc-recovery-action-row">
      <Link to="/support" className={actionLinkClassName('primary', 'md')}>
        {copy.supportAction}
      </Link>
      <Link to="/market" className={actionLinkClassName('secondary', 'md')}>
        {copy.marketAction}
      </Link>
      <SignOutButton redirectUrl="/">
        <Button type="button" variant="secondary" size="md">Sign out</Button>
      </SignOutButton>
    </div>
  )
}

export function isOperatorSurfaceForbidden(error: unknown): boolean {
  if (error instanceof OperatorSurfaceForbiddenError) return true
  if (typeof error !== 'object' || error === null) return false
  return Reflect.get(error, 'code') === 'operator_surface_forbidden'
    || Reflect.get(error, 'message') === OPERATOR_SURFACE_FORBIDDEN_MESSAGE
}
