import { createFileRoute } from '@tanstack/react-router'
import { handleBrowserCustomerRequestEvidenceGet } from '@/lib/server/customer-request-browser-lifecycle-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
export const Route = createFileRoute('/api/requests/$requestRef/evidence')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleBrowserCustomerRequestEvidenceGet(request, params.requestRef),
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
