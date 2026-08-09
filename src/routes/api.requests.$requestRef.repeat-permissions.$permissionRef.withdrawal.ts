import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestRepeatPermissionWithdrawPost } from '@/lib/server/customer-request-repeat-permission-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/requests/$requestRef/repeat-permissions/$permissionRef/withdrawal')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleCustomerRequestRepeatPermissionWithdrawPost(
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
