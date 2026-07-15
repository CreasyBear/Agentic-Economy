import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestConfirmationPost } from '@/lib/server/customer-request-browser-lifecycle-api'

export const Route = createFileRoute('/api/requests/$requestRef/confirmation')({
  server: { handlers: { POST: ({ request, params }) => handleBrowserCustomerRequestConfirmationPost(request, params.requestRef) } },
})
