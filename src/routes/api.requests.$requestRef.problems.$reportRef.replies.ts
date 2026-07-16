import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestProblemReplyPost } from '@/lib/server/customer-request-browser-lifecycle-api'

export const Route = createFileRoute('/api/requests/$requestRef/problems/$reportRef/replies')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleBrowserCustomerRequestProblemReplyPost(
        request,
        params.requestRef,
        params.reportRef,
      ),
    },
  },
})
