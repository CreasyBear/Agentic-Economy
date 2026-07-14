import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerOptionsPost } from '@/lib/server/customer-request-browser-api'

export const Route = createFileRoute('/api/requests/$requestRef/options')({
  server: { handlers: { POST: ({ request, params }) => handleBrowserCustomerOptionsPost(request, params.requestRef) } },
})
