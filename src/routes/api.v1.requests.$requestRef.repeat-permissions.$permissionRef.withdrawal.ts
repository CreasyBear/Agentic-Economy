import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestRepeatPermissionWithdrawPost } from '@/lib/server/customer-request-agent-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/requests/$requestRef/repeat-permissions/$permissionRef/withdrawal')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleAgentCustomerRequestRepeatPermissionWithdrawPost(
        request,
        params.requestRef,
        params.permissionRef,
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
