import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestProblemReplyPost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/problems/$reportRef/replies')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleAgentCustomerRequestProblemReplyPost(
        request,
        params.requestRef,
        params.reportRef,
      ),
    },
  },
})
