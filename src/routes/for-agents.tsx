import { createFileRoute } from '@tanstack/react-router'
import { Bot } from 'lucide-react'

import { AeAgentDoorPage } from '@/components/ae/agents/AeAgentDoorPage'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'
import { AGENT_PAGE } from '@/content/brand-copy'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/for-agents')({
  staticData: {
    nav: {
      label: 'For agents',
      header: { order: 1 },
      footer: { column: 'Market', order: 1 },
      operatorUtility: { roles: ['owner', 'admin', 'developer'], order: 1, icon: Bot },
    },
  },
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

  return (
    <AePublicPage>
      <AeAgentDoorPage canonicalBaseUrl={canonicalBaseUrl} />
    </AePublicPage>
  )
}
