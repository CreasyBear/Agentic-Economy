import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestProblemReplyPost } from '@/lib/server/customer-request-browser-lifecycle-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/requests/$requestRef/problems/$reportRef/replies')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleBrowserCustomerRequestProblemReplyPost(
        request,
        params.requestRef,
        params.reportRef,
      ),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})
