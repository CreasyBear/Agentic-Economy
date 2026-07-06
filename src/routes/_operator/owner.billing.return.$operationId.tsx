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

export const Route = createFileRoute('/_operator/owner/billing/return/$operationId')({
  ...operatorRouteOptions,
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
        setMessage('Return recorded.')
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
  const currentPath = `/owner/billing/return/${params.operationId}`

  return (
    <AeOperatorShell
      operatorRole="owner"
      eyebrow="Provider return"
      title="Return recorded"
      description="Your return was recorded. Billing stays inactive until the payment provider confirms."
      currentPath={currentPath}
    >
      <div className="grid gap-6">
        {message === undefined ? null : (
          <Banner
            status="success"
            title="Return recorded"
            description={message}
          />
        )}
        {error === undefined ? null : (
          <Banner
            status="error"
            title="Return could not be recorded"
            description={error}
          />
        )}
        <OwnerBillingStatePanel summary={summary} />
      </div>
    </AeOperatorShell>
  )
}
