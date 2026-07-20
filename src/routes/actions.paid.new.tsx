import { createFileRoute } from '@tanstack/react-router'

import { handleHostedPaidOperationHumanCreate } from '@/lib/server/hosted-paid-operation-human-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'

export const Route = createFileRoute('/actions/paid/new')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runtime = await getHostedPaidOperationRuntime()
        return handleHostedPaidOperationHumanCreate(request, { creation: runtime.creation })
      },
    },
  },
  component: PaidOperationSetup,
})

function PaidOperationSetup() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Try a paid sandbox task</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Choose one labelled sandbox provider. No real payment or provider fulfilment is implied.
      </p>
      <form method="post" className="mt-8 grid gap-4">
        <label htmlFor="providerKey">Provider</label>
        <select id="providerKey" name="providerKey" className="min-h-11 rounded-md border px-3">
          <option value="A">Sandbox provider A</option>
          <option value="B">Sandbox provider B</option>
        </select>
        <button type="submit" className="min-h-11 rounded-md border px-4">Create task</button>
      </form>
    </main>
  )
}
