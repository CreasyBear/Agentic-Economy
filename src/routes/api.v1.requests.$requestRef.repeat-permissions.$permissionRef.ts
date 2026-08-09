import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestRepeatPermissionGet } from '@/lib/server/customer-request-agent-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/requests/$requestRef/repeat-permissions/$permissionRef')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleAgentCustomerRequestRepeatPermissionGet(
        request,
        params.requestRef,
        params.permissionRef,
      ),
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
