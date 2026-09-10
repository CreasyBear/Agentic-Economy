import { createFileRoute } from '@tanstack/react-router'

import { handleCallListGet } from '@/lib/server/call-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'

const routeContract = CALL_ROUTE_CONTRACT.list

export const Route = createFileRoute('/api/v1/calls')({
  server: {
    handlers: {
      [routeContract.method]: ({ request }) => handleCallListGet(request),
      POST: () => methodNotAllowed([routeContract.method]),
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
