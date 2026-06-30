import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  OwnerBillingReceiptList,
  OwnerBillingStatePanel,
} from '@/future-phases/05-paid-activation-money-rails/owner-billing.panels'
import { summarizeOwnerBillingRoute } from '@/future-phases/05-paid-activation-money-rails/owner-billing.readback'
import {
  readCurrentOwnerBillingServer,
  startCurrentOwnerPaidActivationServer,
  type OwnerBillingMutationServerResult,
} from '@/modules/billing/billing.functions'
import { ownerBillingServerToRouteReadback } from '@/routes/owner.billing'

export const Route = createFileRoute('/owner/billing/activate')({
  loader: () => readCurrentOwnerBillingServer(),
  head: () => ({
    meta: [
      { title: 'Owner billing activation | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBillingActivateRoute,
})

function OwnerBillingActivateRoute() {
  const loaderData = Route.useLoaderData()
  const startActivation = useServerFn(startCurrentOwnerPaidActivationServer)
  const [readback, setReadback] = useState(() => ownerBillingServerToRouteReadback(loaderData))
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>(readback.error?.reason)

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(undefined)
    setError(undefined)
    const offer = readback.ownerOffers[0]
    if (offer === undefined) {
      setError('No active source-owned billing offer is available for this owner business.')
      return
    }

    setPending(true)
    try {
      const result = await startActivation({ data: { offerId: offer.id } })
      handleResult(result)
    } finally {
      setPending(false)
    }
  }

  function handleResult(result: OwnerBillingMutationServerResult) {
    if (result.kind === 'error') {
      setError(result.reason)
      return
    }

    setReadback(result.readback)
    setMessage(
      result.operation?.checkoutUrl === undefined
        ? 'Activation operation recorded. Waiting for provider readback.'
        : 'Activation operation recorded. Continue through the provider redirect.'
    )
  }

  const summary = summarizeOwnerBillingRoute(readback, 'activate')
  const checkoutUrl = readback.latestOperation?.checkoutUrl

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Owner billing"
      title="Review the activation readback."
      description="This route starts checkout only from an authenticated source-owned owner operation. Return URLs do not create paid state."
      currentPath="/owner/billing/activate"
      breadcrumbs={[
        { label: 'Billing', href: '/owner/billing' },
        { label: 'Activate' },
      ]}
    >
      <div className="grid gap-6">
        {message === undefined ? null : (
          <Alert>
            <AlertTitle>Billing operation recorded</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Activation needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <OwnerBillingStatePanel summary={summary} />
        <form onSubmit={handleStart}>
          <Button type="submit" disabled={pending || readback.ownerOffers.length === 0}>
            {pending ? 'Starting activation...' : 'Start activation'}
          </Button>
        </form>
        {checkoutUrl === undefined ? null : (
          <Button asChild className="w-fit">
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
              Continue provider redirect
            </a>
          </Button>
        )}
        <OwnerBillingReceiptList receipts={readback.owner.receipts} />
      </div>
    </AeOperatorShell>
  )
}
