import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import {
  AccountSettingsSection,
  BusinessSettingsSection,
  NotificationSettingsSection,
} from '@/components/ae/settings/OwnerSettingsSections'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  readOwnerNotificationPreferencesServer,
  type OwnerNotificationPreferencesReadResult,
} from '@/modules/settings/settings.functions'

export const Route = createFileRoute('/_operator/owner/settings')({
  ...operatorRouteOptions,
  loader: () => readOwnerNotificationPreferencesServer(),
  head: () => ({
    meta: [
      { title: 'Owner settings | Agentic Economy' },
      { name: 'description', content: 'Owner account, notification, and business page settings.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsRoute,
})

function OwnerSettingsRoute() {
  const initialReadback = Route.useLoaderData()
  const [readback, setReadback] = useState<OwnerNotificationPreferencesReadResult>(initialReadback)

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Settings"
      description="Manage your AE account profile, message emails, and business page links."
      currentPath="/owner/settings"
    >
      <div className="grid gap-6">
        <AccountSettingsSection />
        <NotificationSettingsSection readback={readback} onReadbackChange={setReadback} />
        <BusinessSettingsSection />
      </div>
    </AeOperatorShell>
  )
}
