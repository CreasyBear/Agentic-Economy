import { createFileRoute } from '@tanstack/react-router'
import { handleCustomerRequestProblemPost } from '@/lib/server/customer-request-recovery-api'
export const Route = createFileRoute('/api/requests/$requestRef/problems')({
  server: { handlers: { POST: ({ request, params }) => handleCustomerRequestProblemPost(request, params.requestRef) } },
})
