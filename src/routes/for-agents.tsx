import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'

import { AeAgentDoorPage } from '@/components/ae/agents/AeAgentDoorPage'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'
import { AGENT_PAGE } from '@/content/brand-copy'
import type { NativeMcpClientId } from '@/lib/cli-distribution'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

type ForAgentsSearch = Readonly<{ setupApp?: NativeMcpClientId }>

function validateForAgentsSearch(search: unknown): ForAgentsSearch {
  const setupApp = typeof search === 'object' && search !== null && !Array.isArray(search)
    ? (search as Record<string, unknown>).setupApp
    : undefined
  return setupApp === 'codex' || setupApp === 'claude-code' || setupApp === 'cursor'
    ? { setupApp }
    : {}
}

export const Route = createFileRoute('/for-agents')({
  validateSearch: validateForAgentsSearch,
  loader: () => readCanonicalBaseUrlServer(),
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  head: ({ loaderData }) => buildPublicPageHead({
    path: '/for-agents',
    title: AGENT_PAGE.metaTitle,
    description: AGENT_PAGE.metaDescription,
    ...(loaderData === undefined ? {} : { canonicalBaseUrl: loaderData }),
  }),
  component: ForAgentsRoute,
})

function ForAgentsRoute() {
  const canonicalBaseUrl = Route.useLoaderData()
  const { setupApp } = validateForAgentsSearch(Route.useSearch())
  const location = useLocation()
  const navigate = useNavigate({ from: '/for-agents' })

  const handleSetupAppChange = (nextSetupApp: NativeMcpClientId | undefined) => {
    void navigate({
      search: nextSetupApp === undefined ? {} : { setupApp: nextSetupApp },
      hash: location.hash,
      replace: true,
    })
  }

  return (
    <AePublicPage>
      <AeAgentDoorPage
        canonicalBaseUrl={canonicalBaseUrl}
        {...(setupApp === undefined ? {} : { setupApp })}
        onSetupAppChange={handleSetupAppChange}
      />
    </AePublicPage>
  )
}
