import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestMessagePost } from '@/lib/server/customer-request-browser-api'

export const Route = createFileRoute('/api/requests/$requestRef/messages')({
  server: { handlers: { POST: ({ request, params }) => handleBrowserCustomerRequestMessagePost(request, params.requestRef) } },
})
