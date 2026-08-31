import { Link, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { Button } from '@/components/ui/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

export function PublicRoutePending() {
  return (
    <AePageSkeleton
      title="Loading page"
      description="Loading the latest available information."
    />
  )
}

export function PublicRouteError({ error }: { error: unknown }) {
  const router = useRouter()
  const retryLock = useRef(false)
  const [retryPending, setRetryPending] = useState(false)
  const correlationRef = publicErrorCorrelationRef(error)

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

export function publicErrorCorrelationRef(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  for (const key of ['correlationRef', 'correlationId'] as const) {
    const value = Reflect.get(error, key)
    if (typeof value !== 'string') continue
    const bounded = value.trim()
    if (bounded.length > 0 && bounded.length <= 200) return bounded
  }
  return undefined
}
