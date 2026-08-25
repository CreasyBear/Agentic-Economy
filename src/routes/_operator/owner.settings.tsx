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
      { name: 'description', content: 'Supplier account and Operation settings.' },
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
      description="Manage your account, supplier profile, and Operations."
      currentPath="/owner/settings"
    >
      <div className="grid gap-6">
        <AccountSettingsSection />
        <BusinessSettingsSection />
      </div>
    </AeOperatorShell>
  )
}
