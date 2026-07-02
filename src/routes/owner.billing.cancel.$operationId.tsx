import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { OwnerBillingStatePanel } from '@/future-phases/05-paid-activation-money-rails/owner-billing.panels'
import { summarizeOwnerBillingRoute } from '@/future-phases/05-paid-activation-money-rails/owner-billing.readback'
import {
  readCurrentOwnerBillingServer,
  recordCurrentOwnerBillingReturnServer,
} from '@/modules/billing/billing.functions'
import { ownerBillingServerToRouteReadback } from '@/routes/owner.billing'

export const Route = createFileRoute('/owner/billing/cancel/$operationId')({
  loader: () => readCurrentOwnerBillingServer(),
  head: () => ({
    meta: [
      { title: 'Owner billing canceled | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingCancelRoute,
})

function OwnerBillingCancelRoute() {
  const params = Route.useParams()
  const loaderData = Route.useLoaderData()
  const recordReturn = useServerFn(recordCurrentOwnerBillingReturnServer)
  const [readback, setReadback] = useState(() => ownerBillingServerToRouteReadback(loaderData))
  const [message, setMessage] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false
    async function record() {
      const result = await recordReturn({
        data: {
          operationId: params.operationId,
          returnedPath: `/owner/billing/cancel/${params.operationId}`,
        },
      })
      if (cancelled) return
      if (result.kind === 'ok') {
        setReadback(result.readback)
        setMessage('Cancel recorded.')
      } else {
        setError(result.reason)
      }
    }
    void record()
    return () => {
      cancelled = true
    }
  }, [params.operationId, recordReturn])

  const summary = summarizeOwnerBillingRoute(readback, 'cancel')

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Canceled return"
      title="Return canceled"
      description="Your canceled return was recorded. No plan was started."
      currentPath="/owner/billing/cancel"
    >
      <div className="grid gap-6">
        {message === undefined ? null : (
          <Alert>
            <AlertTitle>Cancel recorded</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Cancel could not be recorded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <OwnerBillingStatePanel summary={summary} />
      </div>
    </AeOperatorShell>
  )
}
