import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestGet } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef')({
  server: { handlers: { GET: ({ params }) => handleAgentCustomerRequestGet(params.requestRef) } },
})
