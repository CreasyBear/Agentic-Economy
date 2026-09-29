import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AeAgentAccessAuthorizePage } from '@/components/ae/agent-access/authorize/AeAgentAccessAuthorizePage'
import { loadAgentAccessAuthorize } from '@/components/ae/agent-access/authorize/load-agent-access-authorize'
import { recoverableSearch } from '@/lib/client/recoverable-search'
import {
  OperatorRouteError,
  OperatorRouteNotFound,
  OperatorRoutePending,
} from '@/components/ae/layout/AeRouteStates'

const authorizeSearchSchema = z.object({
  user_code: z.string().trim().min(3).max(32).optional(),
  grant_ref: z.string().trim().min(3).max(160).optional(),
  state: z.string().max(2_048).optional(),
})
type AuthorizeSearch = z.infer<typeof authorizeSearchSchema> & { rejected?: string }
const parseAuthorizeSearch = recoverableSearch(authorizeSearchSchema, {
  identifierKeys: ['user_code', 'grant_ref', 'state'],
})

export const Route = createFileRoute('/_operator/agent-access/authorize')({
  validateSearch: (search: Record<string, unknown>): AuthorizeSearch => parseAuthorizeSearch(search),
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
  const { rejected } = Route.useSearch()
  return <>
    {rejected === undefined ? null : <p role="status" className="px-4 pt-4 text-sm text-muted-foreground">{rejected}</p>}
    <AeAgentAccessAuthorizePage loaded={loaded} />
  </>
}
