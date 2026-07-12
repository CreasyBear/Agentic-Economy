import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestFactsPost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/facts')({
  server: { handlers: { POST: ({ request, params }) => handleAgentCustomerRequestFactsPost(request, params.requestRef) } },
})
