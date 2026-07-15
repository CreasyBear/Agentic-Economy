import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestCancelPost } from '@/lib/server/customer-request-browser-lifecycle-api'

export const Route = createFileRoute('/api/requests/$requestRef/cancellation')({
  server: { handlers: { POST: ({ request, params }) => handleBrowserCustomerRequestCancelPost(request, params.requestRef) } },
})
