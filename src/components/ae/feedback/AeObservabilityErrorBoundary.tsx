import { ClientOnly } from '@tanstack/react-router'
import type { ErrorBoundary as SentryErrorBoundary } from '@sentry/react'
import { useEffect, useState, type ReactNode } from 'react'

function AeObservabilityErrorFallback() {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col justify-center gap-3 px-4 py-12">
      <h1 className="font-heading text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        This page hit an unexpected error. Refresh and try again. If it keeps happening, return to the registry or ask flow.
      </p>
    </div>
  )
}

function AeObservabilityErrorBoundaryClient({ children }: { children: ReactNode }) {
  const [Boundary, setBoundary] = useState<typeof SentryErrorBoundary | null>(null)

  useEffect(() => {
    void import('@/lib/observability/sentry.client').then(({ Sentry }) => {
      setBoundary(Sentry.ErrorBoundary)
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
