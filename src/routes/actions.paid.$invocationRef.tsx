import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import {
  handleHostedPaidOperationHumanCommand,
  handleHostedPaidOperationHumanInspect,
  requireHostedPaidOperationHumanBeforeLoad,
} from '@/lib/server/hosted-paid-operation-human-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'

type HostedPaidOperationDetailReadback = Readonly<{
  status: number
  body: unknown
}>

const readHostedPaidOperationDetailServer = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('hosted_paid_operation_detail_input_invalid')
    }
    const candidate = data as Record<string, unknown>
    if (typeof candidate.invocationRef !== 'string'
      || candidate.invocationRef.trim().length === 0
      || !Number.isSafeInteger(candidate.expectedInvocationVersion)
      || (candidate.expectedInvocationVersion as number) < 0) {
      throw new Error('hosted_paid_operation_detail_input_invalid')
    }
    return {
      invocationRef: candidate.invocationRef,
      expectedInvocationVersion: candidate.expectedInvocationVersion as number,
    }
  })
  .handler(async ({ data }) => {
    const runtime = await getHostedPaidOperationRuntime()
    const response = await handleHostedPaidOperationHumanInspect(
      data.invocationRef,
      data.expectedInvocationVersion,
      { gateway: runtime.gateway, provenance: runtime.provenance },
    )
    return { status: response.status, body: await response.json() }
  })

export const Route = createFileRoute('/actions/paid/$invocationRef')({
  validateSearch: (search: Record<string, unknown>) => ({
    expectedInvocationVersion: Number(search.expectedInvocationVersion),
  }),
  loaderDeps: ({ search }) => search,
  beforeLoad: requireHostedPaidOperationHumanBeforeLoad,
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const runtime = await getHostedPaidOperationRuntime()
        return handleHostedPaidOperationHumanCommand(request, params.invocationRef, {
          gateway: runtime.gateway,
          provenance: runtime.provenance,
          currentVersion: (ref) => runtime.currentVersion(ref),
        })
      },
    },
  },
  loader: ({ params, deps }) => readHostedPaidOperationDetailServer({
    data: {
      invocationRef: params.invocationRef,
      expectedInvocationVersion: deps.expectedInvocationVersion,
    },
  }),
  head: () => ({
    meta: [
      { title: 'Paid sandbox operation | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PaidOperationDetailRoute,
})

function PaidOperationDetailRoute() {
  const result = Route.useLoaderData()
  return <HostedPaidOperationDetailView result={result} />
}

export function HostedPaidOperationDetailView({
  result,
}: Readonly<{ result: HostedPaidOperationDetailReadback }>) {
  if (result.status === 404) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Operation unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This operation is not available to this account.
        </p>
        <Link className="mt-6 inline-block underline" to="/actions/paid/new">
          Back to Sandbox setup
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Paid sandbox task</h1>
      <pre className="mt-6 overflow-auto rounded-md border p-4 text-sm">
        {JSON.stringify(result.body, null, 2)}
      </pre>
    </main>
  )
}
