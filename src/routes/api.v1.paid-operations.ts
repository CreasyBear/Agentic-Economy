import { createFileRoute } from '@tanstack/react-router'

import { handleHostedPaidOperationAgentCreate } from '@/lib/server/hosted-paid-operation-agent-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'

export const Route = createFileRoute('/api/v1/paid-operations')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return handleHostedPaidOperationAgentCreate(request, {
          runtime: async (principal) => await getHostedPaidOperationRuntime({
            authMode: { kind: 'agent_service', principal },
          }),
        })
      },
    },
  },
})
