import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { TeamRolesPage } from '@/components/ae/settings/team-roles/TeamRolesPage'
import { TeamRolesPending } from '@/components/ae/settings/team-roles/TeamRolesPending'
import { readTeamRolesServer } from '@/components/ae/settings/team-roles/team-roles.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/team')({
  ...operatorRouteOptions,
  validateSearch: z.object({ purpose: z.literal('transfer').optional().catch(undefined) }),
  loader: () => readTeamRolesServer(),
  pendingComponent: TeamRolesPending,
  head: () => ({ meta: [{ title: 'Team & roles | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: TeamRoute,
})

function TeamRoute() {
  return <TeamRolesPage {...Route.useLoaderData()} transferRequested={Route.useSearch().purpose === 'transfer'} />
}
