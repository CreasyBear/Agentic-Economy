import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import {
  AccountSettingsSection,
  BusinessSettingsSection,
} from '@/components/ae/settings/OwnerSettingsSections'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings')({
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: 'Owner settings | Agentic Economy' },
      { name: 'description', content: 'Owner account and business page settings.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsRoute,
})

function OwnerSettingsRoute() {
  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Settings"
      description="Manage your AE account profile and business page links."
      currentPath="/owner/settings"
    >
      <div className="grid gap-6">
        <AccountSettingsSection />
        <BusinessSettingsSection />
      </div>
    </AeOperatorShell>
  )
}
