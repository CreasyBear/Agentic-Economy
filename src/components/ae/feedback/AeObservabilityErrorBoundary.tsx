import { ErrorBoundary as SentryErrorBoundary } from '@sentry/react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { attemptViteStaleChunkReload } from '@/lib/observability/stale-chunk-reload'

/**
 * A dead end is the failure mode here: telling someone to "refresh" without a
 * control leaves them with the browser chrome as the only way out. Retry first,
 * then the one destination that always exists.
 */
function AeObservabilityErrorFallback() {
  return (
    <AeEmptyState
      title="Something went wrong"
      description="The page stopped unexpectedly. Try loading it again, or continue from the Tool catalogue."
      role="alert"
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button type="button" variant="default" className="min-h-touch" onClick={() => window.location.reload()}>
            Try again
          </Button>
          <a href="/market" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>Browse Tools</a>
        </div>
      }
    />
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
