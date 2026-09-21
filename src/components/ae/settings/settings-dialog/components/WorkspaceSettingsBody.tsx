import { OrganizationProfile } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeTeamDirectoryTable } from '@/components/ae/settings/AeTeamDirectoryTable'
import { TaxProfileFormSection } from '@/components/ae/settings/TaxProfileFormSection'
import { WorkspaceDangerZone } from '@/components/ae/settings/workspace-danger-zone/WorkspaceDangerZone'
import { clerkAppearance } from '@/components/ae/website/clerk-appearance'
import { api } from '../../../../../../convex/_generated/api'

export function WorkspaceSettingsBody() {
  const directory = useQuery(api.workspaceTeam.listDirectory)

  return (
    <div className="grid gap-8">
      <div className="min-h-96 w-full">
        <OrganizationProfile
          routing="hash"
          afterLeaveOrganizationUrl="/owner"
          appearance={clerkAppearance}
        >
          <OrganizationProfile.Page label="general" />
        </OrganizationProfile>
      </div>
      <AeSection title="Billing & tax">
        <TaxProfileFormSection />
      </AeSection>
      <AeSection title="Danger zone">
        <WorkspaceDangerZone />
      </AeSection>
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
        <h2 className="text-base font-medium tracking-tight text-foreground">Canonical directory</h2>
        <AeTeamDirectoryTable {...(directory !== undefined ? { directory } : {})} />
      </section>
    </div>
  )
}
