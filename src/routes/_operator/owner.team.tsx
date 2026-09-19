import { createFileRoute } from '@tanstack/react-router'
import { OrganizationProfile } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { Users } from 'lucide-react'

import { AeTeamDirectoryTable } from '@/components/ae/settings/AeTeamDirectoryTable'
import { clerkAppearance } from '@/components/ae/website/clerk-appearance'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { api } from '../../../convex/_generated/api'

export const Route = createFileRoute('/_operator/owner/team')({
  staticData: {
    nav: {
      label: 'Team',
      operator: {
        roles: ['owner'],
        group: 'Workspace',
        groupOrder: 0,
        order: 2,
        icon: Users,
        tier: 'core',
      },
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
    <div className="ae-owner-team grid gap-8">
      <div id="invite" className="min-h-96 w-full">
        <OrganizationProfile
          routing="hash"
          afterLeaveOrganizationUrl="/owner"
          appearance={clerkAppearance}
        >
          <OrganizationProfile.Page label="members" />
        </OrganizationProfile>
      </div>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Canonical Directory
        </h2>
        <AeTeamDirectoryTable {...(directory !== undefined ? { directory } : {})} />
      </section>
    </div>
  )
}
