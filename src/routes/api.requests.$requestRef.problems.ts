import { createFileRoute } from '@tanstack/react-router'
import { handleBrowserCustomerRequestProblemPost } from '@/lib/server/customer-request-browser-lifecycle-api'
export const Route = createFileRoute('/api/requests/$requestRef/problems')({
  server: { handlers: { POST: ({ request, params }) => handleBrowserCustomerRequestProblemPost(request, params.requestRef) } },
})
