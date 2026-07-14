import { createFileRoute } from '@tanstack/react-router'
import { handleAgentCustomerRequestProblemPost } from '@/lib/server/customer-request-agent-api'
export const Route = createFileRoute('/api/v1/requests/$requestRef/problems')({
  server: { handlers: { POST: ({ request, params }) => handleAgentCustomerRequestProblemPost(request, params.requestRef) } },
})
