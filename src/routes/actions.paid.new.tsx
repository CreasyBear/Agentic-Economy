import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import {
  handleHostedPaidOperationHumanCreateNavigation,
  requireHostedPaidOperationHumanBeforeLoad,
} from '@/lib/server/hosted-paid-operation-human-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'

export const Route = createFileRoute('/actions/paid/new')({
  beforeLoad: requireHostedPaidOperationHumanBeforeLoad,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runtime = await getHostedPaidOperationRuntime()
        return handleHostedPaidOperationHumanCreateNavigation(request, {
          creation: runtime.creation,
        })
      },
    },
  },
  head: () => ({
    meta: [
      { title: 'Sandbox setup | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PaidOperationSetup,
})

const sandboxProviders = [
  { providerKey: 'A', providerName: 'Sandbox provider A' },
  { providerKey: 'B', providerName: 'Sandbox provider B' },
] as const

function PaidOperationSetup() {
  const [providerKey, setProviderKey] = useState<'A' | 'B'>()

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <p className="text-sm text-muted-foreground">
        Hosted sandbox · Uses labelled mock providers · No real payment
      </p>
      <h1 className="mt-3 text-2xl font-semibold">Sandbox setup</h1>
      <h2 className="mt-8 text-xl font-semibold">Get the latest BTC price in USD</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Choose one labelled mock fixture for this evaluator trial. No real payment.
      </p>
      <form method="post" className="mt-8 grid gap-4">
        <fieldset className="grid gap-3">
          <legend className="text-base font-semibold">Choose a labelled mock fixture</legend>
          {sandboxProviders.map((provider) => (
            <label
              key={provider.providerKey}
              className="grid min-h-11 cursor-pointer grid-cols-[auto_1fr] gap-3 rounded-md border p-4"
            >
              <input
                type="radio"
                name="providerKey"
                value={provider.providerKey}
                checked={providerKey === provider.providerKey}
                onChange={() => setProviderKey(provider.providerKey)}
                aria-label={provider.providerName}
                required
              />
              <span className="grid gap-1">
                <span className="font-semibold">{provider.providerName}</span>
                <span className="text-sm text-muted-foreground">Mock provider</span>
                <span className="text-sm text-muted-foreground">Operation revision 1</span>
                <span
                  className="text-sm text-muted-foreground"
                  aria-label="Maximum charge one cent, United States dollars"
                >
                  $0.01 USD
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={providerKey === undefined}
          className="min-h-11 rounded-md border px-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create sandbox operation
        </button>
      </form>
    </main>
  )
}
