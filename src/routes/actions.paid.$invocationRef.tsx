import { createFileRoute } from '@tanstack/react-router'

import { handleHostedPaidOperationHumanInspect } from '@/lib/server/hosted-paid-operation-human-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'

export const Route = createFileRoute('/actions/paid/$invocationRef')({
  validateSearch: (search: Record<string, unknown>) => ({
    expectedInvocationVersion: Number(search.expectedInvocationVersion),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const runtime = await getHostedPaidOperationRuntime()
    const response = await handleHostedPaidOperationHumanInspect(
      params.invocationRef,
      deps.expectedInvocationVersion,
      { gateway: runtime.gateway, provenance: runtime.provenance },
    )
    return { status: response.status, body: await response.json() }
  },
  component: PaidOperationDetail,
})

function PaidOperationDetail() {
  const result = Route.useLoaderData()
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Paid sandbox task</h1>
      <pre className="mt-6 overflow-auto rounded-md border p-4 text-sm">
        {JSON.stringify(result.body, null, 2)}
      </pre>
    </main>
  )
}
