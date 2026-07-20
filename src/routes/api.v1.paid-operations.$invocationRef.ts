import { createFileRoute } from '@tanstack/react-router'

import { handleHostedPaidOperationAgentInspect } from '@/lib/server/hosted-paid-operation-agent-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'

export const Route = createFileRoute('/api/v1/paid-operations/$invocationRef')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const runtime = await getHostedPaidOperationRuntime()
        const version = Number(new URL(request.url).searchParams.get('expectedInvocationVersion'))
        return handleHostedPaidOperationAgentInspect(params.invocationRef, version, {
          gateway: runtime.gateway,
          provenance: runtime.provenance,
          currentVersion: (ref) => runtime.currentVersion(ref),
        })
      },
    },
  },
})
