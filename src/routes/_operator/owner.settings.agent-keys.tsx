import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AeAgentKeysSettings } from '@/components/ae/settings/agent-keys/AeAgentKeysSettings'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/agent-keys')({
  ...operatorRouteOptions,
  validateSearch: z.object({ issue: z.literal('manual').optional() }),
  loader: async () => {
    const [directory, canonicalBaseUrl] = await Promise.all([
      readAgentDirectoryServer(),
      readCanonicalBaseUrlServer(),
    ])
    return { directory, canonicalBaseUrl }
  },
  head: () => ({ meta: [
    { title: 'Agent keys | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: AgentKeysRoute,
})

function AgentKeysRoute() {
  const { directory, canonicalBaseUrl } = Route.useLoaderData()
  const { issue } = Route.useSearch()
  return <AeAgentKeysSettings initialDirectory={directory} canonicalBaseUrl={canonicalBaseUrl} openIssueDialog={issue === 'manual'} />
}
