import { createFileRoute } from '@tanstack/react-router'

import {
  handleAgentCustomerRequestRepeatPermissionAllowPost,
  handleAgentCustomerRequestRepeatPermissionsGet,
} from '@/lib/server/customer-request-agent-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/requests/$requestRef/repeat-permissions')({
  server: {
    handlers: {
      GET: ({ request, params }) => (
        handleAgentCustomerRequestRepeatPermissionsGet(request, params.requestRef)
      ),
      POST: ({ request, params }) => (
        handleAgentCustomerRequestRepeatPermissionAllowPost(request, params.requestRef)
      ),
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
