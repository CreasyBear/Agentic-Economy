import { createFileRoute } from '@tanstack/react-router'
import { OrganizationProfile } from '@clerk/tanstack-react-start'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { WorkspaceDangerZone } from '@/components/ae/settings/workspace-danger-zone/WorkspaceDangerZone'
import { clerkEmbeddedProfileAppearance } from '@/components/ae/website/clerk-appearance'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/workspace')({
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: 'Workspace | Agentic Economy' },
      { name: 'description', content: 'Manage workspace profile, general settings, and organization members.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerWorkspaceRoute,
})

function OwnerWorkspaceRoute() {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Workspace"
      description="Business profile and settings shared by every Agent in this workspace."
      currentPath="/owner/workspace"
    >
      <div className="ae-owner-workspace grid gap-8">
        <div className="min-h-96 w-full">
          <OrganizationProfile
            routing="hash"
            afterLeaveOrganizationUrl="/market"
            appearance={clerkEmbeddedProfileAppearance}
          >
            <OrganizationProfile.Page label="general" />
          </OrganizationProfile>
        </div>
        <AeSection title="Danger zone">
          <WorkspaceDangerZone />
        </AeSection>
      </div>
    </AeOperatorPage>
  )
}
