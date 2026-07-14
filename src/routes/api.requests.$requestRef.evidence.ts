import { createFileRoute } from '@tanstack/react-router'
import { handleCustomerRequestEvidenceGet } from '@/lib/server/customer-request-recovery-api'
export const Route = createFileRoute('/api/requests/$requestRef/evidence')({
  server: { handlers: { GET: ({ request, params }) => handleCustomerRequestEvidenceGet(request, params.requestRef) } },
})
