import { createFileRoute } from '@tanstack/react-router'

import { handleHostedPaidOperationAgentCommand } from '@/lib/server/hosted-paid-operation-agent-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'

export const Route = createFileRoute('/api/v1/paid-operations/$invocationRef/commands')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        return handleHostedPaidOperationAgentCommand(request, params.invocationRef, {
          runtime: async (principal) => await getHostedPaidOperationRuntime({
            authMode: { kind: 'agent_service', principal },
          }),
        })
      },
    },
  },
})
