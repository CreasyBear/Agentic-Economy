import { createFileRoute } from '@tanstack/react-router'
import { OrganizationProfile } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeTeamDirectoryTable } from '@/components/ae/settings/AeTeamDirectoryTable'
import { clerkAppearance } from '@/components/ae/website/clerk-appearance'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { api } from '../../../convex/_generated/api'

export const Route = createFileRoute('/_operator/owner/team')({
  staticData: {
    nav: {
      label: 'Team',
    },
  },
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: 'Team | Agentic Economy' },
      { name: 'description', content: 'Manage team members, roles, and workspace invitations.' },
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
      description="Who can act for this business, their roles, and pending invitations."
      currentPath="/owner/team"
    >
      <div className="ae-owner-team grid min-w-0 gap-8">
        <div id="invite" className="min-h-96 w-full min-w-0 overflow-x-auto">
          <OrganizationProfile
            routing="hash"
            afterLeaveOrganizationUrl="/owner"
            appearance={clerkAppearance}
          >
            <OrganizationProfile.Page label="members" />
          </OrganizationProfile>
        </div>

        <section className="grid min-w-0 gap-4">
          <h2 className="text-base font-medium tracking-tight text-foreground">
            Canonical directory
          </h2>
          <AeTeamDirectoryTable {...(directory !== undefined ? { directory } : {})} />
        </section>
      </div>
    </AeOperatorPage>
  )
}
