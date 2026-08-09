import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestFactsPost } from '@/lib/server/customer-request-browser-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/requests/$requestRef/facts')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleBrowserCustomerRequestFactsPost(request, params.requestRef),
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
