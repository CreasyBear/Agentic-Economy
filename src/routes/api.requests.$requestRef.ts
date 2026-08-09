import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestGet } from '@/lib/server/customer-request-browser-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/requests/$requestRef')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleBrowserCustomerRequestGet(request, params.requestRef),
      POST: () => methodNotAllowed(['GET']),
      PUT: () => methodNotAllowed(['GET']),
      PATCH: () => methodNotAllowed(['GET']),
      DELETE: () => methodNotAllowed(['GET']),
      HEAD: () => methodNotAllowed(['GET']),
      OPTIONS: () => methodNotAllowed(['GET']),
      TRACE: () => methodNotAllowed(['GET']),
      CONNECT: () => methodNotAllowed(['GET']),
    },
  },
})
