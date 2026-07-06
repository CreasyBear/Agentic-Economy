import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Banner } from '@astryxdesign/core/Banner'
import { OwnerBillingStatePanel } from '@/modules/billing/owner-billing.panels'
import { summarizeOwnerBillingRoute } from '@/modules/billing/owner-billing.readback'
import {
  readCurrentOwnerBillingServer,
  recordCurrentOwnerBillingReturnServer,
} from '@/modules/billing/billing.functions'
import { ownerBillingServerToRouteReadback } from '@/routes/_operator/owner.billing'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/billing/cancel/$operationId')({
  ...operatorRouteOptions,
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
  const currentPath = `/owner/billing/cancel/${params.operationId}`

  return (
    <AeOperatorShell
      operatorRole="owner"
      eyebrow="Canceled return"
      title="Return canceled"
      description="Your canceled return was recorded. No plan was started."
      currentPath={currentPath}
    >
      <div className="grid gap-6">
        {message === undefined ? null : (
          <Banner
            status="success"
            title="Cancel recorded"
            description={message}
          />
        )}
        {error === undefined ? null : (
          <Banner
            status="error"
            title="Cancel could not be recorded"
            description={error}
          />
        )}
        <OwnerBillingStatePanel summary={summary} />
      </div>
    </AeOperatorShell>
  )
}
