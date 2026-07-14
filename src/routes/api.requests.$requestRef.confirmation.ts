import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestConfirmationPost } from '@/lib/server/customer-request-confirmation-api'

export const Route = createFileRoute('/api/requests/$requestRef/confirmation')({
  server: { handlers: { POST: ({ request, params }) => handleCustomerRequestConfirmationPost(request, params.requestRef) } },
})
