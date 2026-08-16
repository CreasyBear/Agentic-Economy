import { createFileRoute } from '@tanstack/react-router'

import { handleOperationInvokePost } from '@/lib/server/operation-invoke-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'

const routeContract = OPERATION_INVOKE_ROUTE_CONTRACT.invoke

export const Route = createFileRoute('/api/v1/operations/call')({
  server: {
    handlers: {
      [routeContract.method]: ({ request }) => handleOperationInvokePost(request),
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
