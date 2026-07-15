import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestRunPost } from '@/lib/server/customer-request-browser-lifecycle-api'

export const Route = createFileRoute('/api/requests/$requestRef/run')({
  server: { handlers: { POST: ({ request, params }) => handleBrowserCustomerRequestRunPost(request, params.requestRef) } },
})
