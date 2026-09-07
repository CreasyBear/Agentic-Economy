import { createFileRoute } from '@tanstack/react-router'

import { handleToolCallPost } from '@/lib/server/call-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'

const routeContract = CALL_ROUTE_CONTRACT.call

export const Route = createFileRoute('/api/v1/tools/call')({
  server: {
    handlers: {
      [routeContract.method]: ({ request }) => handleToolCallPost(request),
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
