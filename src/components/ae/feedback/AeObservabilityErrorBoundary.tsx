import { Component, type ReactNode } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/arc/button/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { attemptViteStaleChunkReload } from '@/lib/observability/stale-chunk-reload'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import '../layout/RouteRecoveryComposition.css'

type AeRenderErrorBoundaryProps = Readonly<{
  children: ReactNode
  fallback: ReactNode
  onError?: (error: unknown) => void
}>

type AeRenderErrorBoundaryState = Readonly<{ hasError: boolean }>

/**
 * Local render boundary. `@sentry/react` stays behind the existing dynamic
 * client import so the shell can paint before the SDK is downloaded.
 */
export class AeRenderErrorBoundary extends Component<AeRenderErrorBoundaryProps, AeRenderErrorBoundaryState> {
  override state: AeRenderErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AeRenderErrorBoundaryState {
    return { hasError: true }
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error)
    if (typeof window === 'undefined') return
    captureClientExceptionOnClient(error)
  }

  override render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

/**
 * A dead end is the failure mode here: telling someone to "refresh" without a
 * control leaves them with the browser chrome as the only way out. Retry first,
 * then the one destination that always exists.
 */
function AeObservabilityErrorFallback() {
  return (
    <div className="arc-market arc-render-recovery">
      <Alert variant="destructive" className="arc-recovery-alert">
        <AlertTitle>This page could not be loaded</AlertTitle>
        <AlertDescription>
          <p>Try again or browse Tools.</p>
          <div className="arc-recovery-action-row">
            <Button type="button" size="md" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <a href="/market" className={actionLinkClassName('secondary', 'md')}>Browse Tools</a>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  )
}

export function AeObservabilityErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <AeRenderErrorBoundary
      fallback={<AeObservabilityErrorFallback />}
      onError={(error) => {
        attemptViteStaleChunkReload(error)
      }}
    >
      {children}
    </AeRenderErrorBoundary>
  )
}
