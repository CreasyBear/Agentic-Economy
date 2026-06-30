import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  OwnerBillingReceiptList,
  OwnerBillingStatePanel,
} from '@/future-phases/05-paid-activation-money-rails/owner-billing.panels'
import { summarizeOwnerBillingRoute } from '@/future-phases/05-paid-activation-money-rails/owner-billing.readback'
import {
  readCurrentOwnerBillingServer,
  recordCurrentOwnerBillingReturnServer,
} from '@/modules/billing/billing.functions'
import { ownerBillingServerToRouteReadback } from '@/routes/owner.billing'

export const Route = createFileRoute('/owner/billing/return/$operationId')({
  loader: () => readCurrentOwnerBillingServer(),
  head: () => ({
    meta: [
      { title: 'Owner billing return | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingReturnRoute,
})

function OwnerBillingReturnRoute() {
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
          returnedPath: `/owner/billing/return/${params.operationId}`,
        },
      })
      if (cancelled) return
      if (result.kind === 'ok') {
        setReadback(result.readback)
        setMessage('Return recorded. Paid state still waits for verified provider readback.')
      } else {
        setError(result.reason)
      }
    }
    void record()
    return () => {
      cancelled = true
    }
  }, [params.operationId, recordReturn])

  const summary = summarizeOwnerBillingRoute(readback, 'return')

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Provider return"
      title="Wait for recorded provider readback."
      description="Returning to Agentic Economy does not mark billing active unless the source-owned readback already proves it."
      currentPath="/owner/billing/return"
    >
      <div className="grid gap-6">
        {message === undefined ? null : (
          <Alert>
            <AlertTitle>Return recorded</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Return could not be recorded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <OwnerBillingStatePanel summary={summary} />
        <OwnerBillingReceiptList receipts={readback.owner.receipts} />
      </div>
    </AeOperatorShell>
  )
}
