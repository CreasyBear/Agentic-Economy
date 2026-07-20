import { createFileRoute } from '@tanstack/react-router'

import { handleHostedPaidOperationAgentCreate } from '@/lib/server/hosted-paid-operation-agent-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'

export const Route = createFileRoute('/api/v1/paid-operations')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const runtime = await getHostedPaidOperationRuntime()
        return handleHostedPaidOperationAgentCreate(request, { creation: runtime.creation })
      },
    },
  },
})
