import { createFileRoute } from '@tanstack/react-router'
import { handleAgentCustomerRequestEvidenceGet } from '@/lib/server/customer-request-agent-api'
export const Route = createFileRoute('/api/v1/requests/$requestRef/evidence')({
  server: { handlers: { GET: ({ request, params }) => handleAgentCustomerRequestEvidenceGet(request, params.requestRef) } },
})
