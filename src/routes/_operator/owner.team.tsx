import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeTeamDirectoryTable } from '@/components/ae/settings/AeTeamDirectoryTable'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { api } from '../../../convex/_generated/api'

export const Route = createFileRoute('/_operator/owner/team')({
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: 'Team | Agentic Economy' },
      { name: 'description', content: 'View team members and their authoritative workspace roles.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerTeamRoute,
})

function OwnerTeamRoute() {
  const directory = useQuery(api.workspaceTeam.listDirectory)

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Team"
      description="Who can act for this business and the role recorded for each person."
      currentPath="/owner/team"
    >
      <div className="ae-owner-team grid min-w-0 gap-8">
        <section className="grid min-w-0 gap-4">
          <h2 className="text-base font-medium tracking-tight text-foreground">
            Team
          </h2>
          <AeTeamDirectoryTable {...(directory !== undefined ? { directory } : {})} />
        </section>
      </div>
    </AeOperatorPage>
  )
}
