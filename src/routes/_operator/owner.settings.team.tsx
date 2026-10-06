import { createFileRoute } from '@tanstack/react-router'
import { TeamRolesPage } from '@/components/ae/settings/team-roles/TeamRolesPage'
import { TeamMembersSkeleton } from '@/components/ae/shared/arc-pro/team-members/team-members'
import { readTeamRolesServer } from '@/components/ae/settings/team-roles/team-roles.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/team')({
  ...operatorRouteOptions,
  loader: () => readTeamRolesServer(),
  pendingComponent: TeamMembersSkeleton,
  head: () => ({ meta: [{ title: 'Team & roles | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: TeamRoute,
})

function TeamRoute() {
  return <TeamRolesPage {...Route.useLoaderData()} />
}
