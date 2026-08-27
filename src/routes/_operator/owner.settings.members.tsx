import { createFileRoute } from '@tanstack/react-router'

import { AeWorkspaceMembers } from '@/components/ae/settings/AeWorkspaceMembers'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAgentAccessConsoleServer } from '@/lib/server/agent-access-console.functions'
import type { AgentAccessConsoleReadback } from '@/modules/agent-access/agent-access-console'

export const Route = createFileRoute('/_operator/owner/settings/members')({
  ...operatorRouteOptions,
  loader: async (): Promise<MembersLoaderResult> => {
    if (isLocalE2EAuthBypassEnabled()) {
      return { kind: 'available', items: [] }
    }
    try {
      return { kind: 'available', items: await readAgentAccessConsoleServer() }
    } catch {
      return { kind: 'unavailable' }
    }
  },
  head: () => ({
    meta: [
      { title: 'Members | Agentic Economy' },
      { name: 'description', content: 'Human operators and agent callers for this workspace.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsMembersRoute,
})

type MembersLoaderResult =
  | Readonly<{ kind: 'available'; items: AgentAccessConsoleReadback }>
  | Readonly<{ kind: 'unavailable' }>

function OwnerSettingsMembersRoute() {
  const result = Route.useLoaderData()
  return (
    <AeWorkspaceMembers
      items={result.kind === 'available' ? result.items : []}
      unavailable={result.kind === 'unavailable'}
    />
  )
}
