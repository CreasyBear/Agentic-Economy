import { ErrorBoundary as SentryErrorBoundary } from '@sentry/react'
import type { ReactNode } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { attemptViteStaleChunkReload } from '@/lib/observability/stale-chunk-reload'

/**
 * A dead end is the failure mode here: telling someone to "refresh" without a
 * control leaves them with the browser chrome as the only way out. Retry first,
 * then the one destination that always exists.
 */
function AeObservabilityErrorFallback() {
  return (
    <div className="grid min-h-64 place-content-center py-page">
      <Alert variant="destructive" className="max-w-md">
        <AlertTitle>This page could not be loaded</AlertTitle>
        <AlertDescription>
          <span>Nothing was charged.</span>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="button" variant="default" className="min-h-touch" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <a href="/market" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>Browse Tools</a>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  )
}

export function AeObservabilityErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <SentryErrorBoundary
      fallback={<AeObservabilityErrorFallback />}
      onError={(error) => {
        attemptViteStaleChunkReload(error)
      }}
    >
      {children}
    </SentryErrorBoundary>
  )
}
