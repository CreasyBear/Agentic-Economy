import { ClientOnly } from '@tanstack/react-router'
import type { ErrorBoundary as SentryErrorBoundary } from '@sentry/react'
import { useEffect, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

/**
 * A dead end is the failure mode here: telling someone to "refresh" without a
 * control leaves them with the browser chrome as the only way out. Retry first,
 * then the one destination that always exists.
 */
function AeObservabilityErrorFallback() {
  return (
    <Empty className="mx-auto my-12 max-w-lg border border-border bg-card p-6">
      <EmptyHeader>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>
          This page hit an unexpected error. Nothing you sent was lost. Try again, or pick up from another view.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-3">
          <Button type="button" variant="default" className="min-h-11" onClick={() => window.location.reload()}>
            Try again
          </Button>
          <Button asChild variant="secondary" className="min-h-11"><a href="/t/new">Start a new chat</a></Button>
        </div>
      </EmptyContent>
    </Empty>
  )
}

function AeObservabilityErrorBoundaryClient({ children }: { children: ReactNode }) {
  const [Boundary, setBoundary] = useState<typeof SentryErrorBoundary | null>(null)

  useEffect(() => {
    void import('@/lib/observability/sentry.client')
      .then(({ Sentry }) => {
        setBoundary(() => Sentry.ErrorBoundary)
      })
      .catch(() => {
        // Fall back to the raw children if Sentry fails to load; the client
        // boundary must never leave an unhandled rejection or a stuck null
        // state when observability is unavailable.
      })
  }, [])

  if (Boundary === null) {
    return <>{children}</>
  }

  return <Boundary fallback={<AeObservabilityErrorFallback />}>{children}</Boundary>
}

export function AeObservabilityErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ClientOnly fallback={<>{children}</>}>
      <AeObservabilityErrorBoundaryClient>{children}</AeObservabilityErrorBoundaryClient>
    </ClientOnly>
  )
}
