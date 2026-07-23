import { createFileRoute } from '@tanstack/react-router'

import { handleHostedPaidOperationAgentInspect } from '@/lib/server/hosted-paid-operation-agent-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'

export const Route = createFileRoute('/api/v1/paid-operations/$invocationRef')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const version = Number(new URL(request.url).searchParams.get('expectedInvocationVersion'))
        return handleHostedPaidOperationAgentInspect(params.invocationRef, version, {
          runtime: async (principal) => await getHostedPaidOperationRuntime({
            authMode: { kind: 'agent_service', principal },
          }),
        })
      },
    },
  },
})
