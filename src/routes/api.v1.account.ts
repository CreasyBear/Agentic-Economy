import { createFileRoute } from '@tanstack/react-router'

import { handleAgentAccountGet } from '@/lib/server/agent-account-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT } from '@/modules/agent-access/account.actions'

const routeContract = AGENT_ACCOUNT_SELF_ROUTE_CONTRACT

export const Route = createFileRoute('/api/v1/account')({
  server: {
    handlers: {
      [routeContract.method]: ({ request }) => handleAgentAccountGet(request),
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
