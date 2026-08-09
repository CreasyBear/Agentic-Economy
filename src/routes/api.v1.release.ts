import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestReleaseGet } from '@/lib/server/customer-request-release-readback-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/release')({
  server: {
    handlers: {
      GET: () => handleAgentCustomerRequestReleaseGet(),
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
