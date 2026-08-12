import { createFileRoute } from '@tanstack/react-router'

import { handleOperationInvokeCancelPost } from '@/lib/server/operation-invoke-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'

const routeContract = OPERATION_INVOKE_ROUTE_CONTRACT.cancel

export const Route = createFileRoute('/api/v1/operations/$invocationRef/cancel')({
  server: {
    handlers: {
      [routeContract.method]: ({ request, params }) => handleOperationInvokeCancelPost(request, params.invocationRef),
      GET: () => methodNotAllowed([routeContract.method]),
      PUT: () => methodNotAllowed([routeContract.method]),
      PATCH: () => methodNotAllowed([routeContract.method]),
      DELETE: () => methodNotAllowed([routeContract.method]),
      HEAD: () => methodNotAllowed([routeContract.method]),
      OPTIONS: () => methodNotAllowed([routeContract.method]),
      TRACE: () => methodNotAllowed([routeContract.method]),
      CONNECT: () => methodNotAllowed([routeContract.method]),
    },
  },
})
