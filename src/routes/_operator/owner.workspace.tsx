import { createFileRoute } from '@tanstack/react-router'
import { OrganizationProfile } from '@clerk/tanstack-react-start'
import { Building2 } from 'lucide-react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { TaxProfileFormSection } from '@/components/ae/settings/TaxProfileFormSection'
import { WorkspaceDangerZone } from '@/components/ae/settings/workspace-danger-zone/WorkspaceDangerZone'
import { clerkAppearance } from '@/components/ae/website/clerk-appearance'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/workspace')({
  staticData: {
    nav: {
      label: 'Workspace',
      operator: {
        roles: ['owner'],
        group: 'Workspace',
        groupOrder: 0,
        order: 1,
        icon: Building2,
        tier: 'core',
      },
    },
  },
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
    <div className="ae-owner-workspace grid gap-8">
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
    </div>
  )
}
