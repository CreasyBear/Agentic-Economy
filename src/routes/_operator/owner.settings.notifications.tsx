import { createFileRoute } from '@tanstack/react-router'

import { OwnerNotificationSettings } from '@/components/ae/settings/OwnerNotificationSettings'
import { SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { useOwnerNotificationPreferences } from '@/components/ae/settings/useOwnerNotificationPreferences'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/notifications')({
  ...operatorRouteOptions,
  head: () => ({ meta: [
    { title: 'Notifications | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: OwnerNotificationsRoute,
})

function OwnerNotificationsRoute() {
  const { preferences, loading, update } = useOwnerNotificationPreferences()
  return <SettingsPage title="Notifications" description="Manage account alerts and saved delivery preferences.">
    <OwnerNotificationSettings preferences={preferences} disabled={loading} onUpdate={update} />
  </SettingsPage>
}
