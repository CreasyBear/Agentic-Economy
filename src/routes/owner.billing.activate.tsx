import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { OwnerBillingStatePanel } from '@/modules/billing/owner-billing.panels'
import { summarizeOwnerBillingRoute } from '@/modules/billing/owner-billing.readback'
import {
  readCurrentOwnerBillingServer,
  startCurrentOwnerPaidActivationServer,
  type OwnerBillingMutationServerResult,
} from '@/modules/billing/billing.functions'
import { ownerBillingServerToRouteReadback } from '@/routes/owner.billing'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/owner/billing/activate')({
  ...operatorRouteOptions,
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
      setError('No active billing offer is available for this owner business.')
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
        ? 'Activation operation recorded. Waiting for the payment provider to confirm.'
        : 'Activation operation recorded. Continue through the provider redirect.'
    )
  }

  const summary = summarizeOwnerBillingRoute(readback, 'activate')
  const checkoutUrl = readback.latestOperation?.checkoutUrl

  return (
    <AeOperatorShell
      operatorRole="owner"
      eyebrow="Owner billing"
      title="Start a paid plan"
      description="Choose a plan for your business. You finish with the payment provider."
      currentPath="/owner/billing/activate"
    >
      <div className="grid gap-6">
        {message === undefined ? null : (
          <Banner
            status="success"
            title="Billing operation recorded"
            description={message}
          />
        )}
        {error === undefined ? null : (
          <Banner
            status="error"
            title="Activation needs attention"
            description={error}
          />
        )}
        <OwnerBillingStatePanel summary={summary} />
        {checkoutUrl === undefined ? (
          <form onSubmit={handleStart}>
            <Button
              type="submit"
              isDisabled={pending || readback.ownerOffers.length === 0}
              label={pending ? 'Starting…' : 'Start a paid plan'}
            />
          </form>
        ) : (
          <Button
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit"
            label="Continue to the payment provider"
          />
        )}
      </div>
    </AeOperatorShell>
  )
}
