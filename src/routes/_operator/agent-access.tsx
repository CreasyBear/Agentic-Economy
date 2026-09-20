import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'

import { AeAgentAccessHome } from '@/components/ae/agent-access/home/AeAgentAccessHome'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import type { AgentAccessSearch } from '@/modules/agent-access/agent-lifecycle.view-model'

const canonicalPrincipalIdPattern = /^prn_[0-9a-f]{32}$/u
const canonicalToolRefPattern = /^operation:v1:[0-9a-f]{64}$/u

export function validateAgentAccessSearch(search: Record<string, unknown>): AgentAccessSearch {
  const caller = typeof search.caller === 'string' ? search.caller.trim() : undefined
  const resumeTool = typeof search.resumeTool === 'string' ? search.resumeTool.trim() : undefined
  return {
    ...(caller !== undefined && canonicalPrincipalIdPattern.test(caller) ? { caller } : {}),
    ...(resumeTool !== undefined && canonicalToolRefPattern.test(resumeTool) ? { resumeTool } : {}),
  }
}

export const Route = createFileRoute('/_operator/agent-access')({
  staticData: {
    nav: {
      label: 'Agents',
      operator: {
        roles: ['owner'],
        group: 'Buy',
        groupOrder: 0,
        order: 1,
        icon: KeyRound,
        tier: 'core',
        mobilePrimary: true,
        mobileOrder: 20,
      },
    },
  },
  ...operatorRouteOptions,
  validateSearch: validateAgentAccessSearch,
  loader: async () => {
    const [canonicalBaseUrl, directory] = await Promise.all([
      readCanonicalBaseUrlServer(),
      readAgentDirectoryServer(),
    ])
    return { canonicalBaseUrl, directory }
  },
  head: () => ({ meta: [
    { title: 'Agents | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: AgentAccessRoute,
})

function AgentAccessRoute() {
  const location = useLocation()
  const { canonicalBaseUrl, directory } = Route.useLoaderData()
  const search = Route.useSearch()
  if (location.pathname !== '/agent-access') return <Outlet />
  return (
    <AeAgentAccessHome
      canonicalBaseUrl={canonicalBaseUrl}
      initialDirectory={directory}
      search={search}
    />
  )
}
