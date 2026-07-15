import { createFileRoute } from '@tanstack/react-router'
import { handleBrowserCustomerRequestEvidenceGet } from '@/lib/server/customer-request-browser-lifecycle-api'
export const Route = createFileRoute('/api/requests/$requestRef/evidence')({
  server: { handlers: { GET: ({ request, params }) => handleBrowserCustomerRequestEvidenceGet(request, params.requestRef) } },
})
