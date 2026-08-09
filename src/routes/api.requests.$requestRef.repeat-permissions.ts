import { createFileRoute } from '@tanstack/react-router'

import {
  handleCustomerRequestConnectedAssistantsGet,
  handleCustomerRequestRepeatPermissionAllowPost,
} from '@/lib/server/customer-request-repeat-permission-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/requests/$requestRef/repeat-permissions')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleCustomerRequestConnectedAssistantsGet(request, params.requestRef),
      POST: ({ request, params }) => handleCustomerRequestRepeatPermissionAllowPost(request, params.requestRef),
      PUT: () => methodNotAllowed(['GET', 'POST']),
      PATCH: () => methodNotAllowed(['GET', 'POST']),
      DELETE: () => methodNotAllowed(['GET', 'POST']),
      HEAD: () => methodNotAllowed(['GET', 'POST']),
      OPTIONS: () => methodNotAllowed(['GET', 'POST']),
      TRACE: () => methodNotAllowed(['GET', 'POST']),
      CONNECT: () => methodNotAllowed(['GET', 'POST']),
    },
  },
})
