import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AeAgentAccessAuthorizePage } from '@/components/ae/agent-access/authorize/AeAgentAccessAuthorizePage'
import { loadAgentAccessAuthorize } from '@/components/ae/agent-access/authorize/load-agent-access-authorize'
import {
  OperatorRouteError,
  OperatorRouteNotFound,
  OperatorRoutePending,
} from '@/components/ae/layout/AeRouteStates'

export const Route = createFileRoute('/_operator/agent-access/authorize')({
  validateSearch: z.object({
    user_code: z.string().trim().min(3).max(32).optional(),
    grant_ref: z.string().trim().min(3).max(160).optional(),
    state: z.string().max(2_048).optional(),
  }),
  loaderDeps: ({ search }) => ({
    userCode: search.user_code,
    grantRef: search.grant_ref,
    state: search.state,
  }),
  ssr: false,
  loader: loadAgentAccessAuthorize,
  head: () => ({ meta: [
    { title: 'Review agent access | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  pendingComponent: OperatorRoutePending,
  errorComponent: OperatorRouteError,
  notFoundComponent: OperatorRouteNotFound,
  component: AgentAccessAuthorizeRoute,
})

function AgentAccessAuthorizeRoute() {
  const loaded = Route.useLoaderData()
  return <AeAgentAccessAuthorizePage loaded={loaded} />
}
