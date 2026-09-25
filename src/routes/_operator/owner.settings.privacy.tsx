import { createFileRoute } from '@tanstack/react-router'

import { ownerSettingsPrivacySection } from '@/components/ae/settings/owner-settings.contracts'
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { buttonVariants } from '@/components/ui/button-variants'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/privacy')({
  ...operatorRouteOptions,
  head: () => ({ meta: [
    { title: 'Privacy | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: OwnerPrivacyRoute,
})

function OwnerPrivacyRoute() {
  return <SettingsPage title="Privacy" description="Download a copy of the data Agentic Economy holds for your account."
    action={<a href={ownerSettingsPrivacySection.downloadHref} download className={buttonVariants()}>Download your data</a>}>
    <SettingsGroup title="Your data">
      <SettingsRow label="Account export" description="Includes identity, memberships, notification preferences and security history.">
        JSON
      </SettingsRow>
    </SettingsGroup>
  </SettingsPage>
}
