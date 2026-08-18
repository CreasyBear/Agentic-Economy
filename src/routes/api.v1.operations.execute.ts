import { createFileRoute } from '@tanstack/react-router'

import { handleOperationInvokePost } from '@/lib/server/operation-invoke-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { withRfc9745DeprecationNotice } from '@/modules/product-frontier/deprecation-notice'

const routeContract = OPERATION_INVOKE_ROUTE_CONTRACT.invoke

function executeDoor(response: Response): Response {
  return withRfc9745DeprecationNotice(response)
}

export const Route = createFileRoute('/api/v1/operations/execute')({
  server: {
    handlers: {
      [routeContract.method]: async ({ request }) => executeDoor(await handleOperationInvokePost(request)),
      GET: () => executeDoor(methodNotAllowed([routeContract.method])),
      PUT: () => executeDoor(methodNotAllowed([routeContract.method])),
      PATCH: () => executeDoor(methodNotAllowed([routeContract.method])),
      DELETE: () => executeDoor(methodNotAllowed([routeContract.method])),
      HEAD: () => executeDoor(methodNotAllowed([routeContract.method])),
      OPTIONS: () => executeDoor(methodNotAllowed([routeContract.method])),
      TRACE: () => executeDoor(methodNotAllowed([routeContract.method])),
      CONNECT: () => executeDoor(methodNotAllowed([routeContract.method])),
    },
  },
})
