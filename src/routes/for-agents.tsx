import { createFileRoute } from '@tanstack/react-router'

import { AeAgentDoorPage } from '@/components/ae/agents/AeAgentDoorPage'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AGENT_PAGE } from '@/content/brand-copy'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/for-agents')({
  loader: () => readCanonicalBaseUrlServer(),
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
    <AePublicShell>
      <AeAgentDoorPage canonicalBaseUrl={canonicalBaseUrl} />
    </AePublicShell>
  )
}
