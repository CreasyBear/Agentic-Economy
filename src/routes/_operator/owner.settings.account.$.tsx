import { UserProfile } from '@clerk/tanstack-react-start'
import { createFileRoute, redirect, useLocation } from '@tanstack/react-router'

import { clerkEmbeddedProfileAppearance } from '@/components/ae/website/clerk-appearance'
import { SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { SecuritySettings } from '@/components/arc/blocks/security-settings/security-settings'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/account/$')({
  ...operatorRouteOptions,
  beforeLoad: ({ params }) => {
    if (params._splat === 'account' || params._splat === 'api-keys') {
      throw redirect({ to: '/owner/settings/account/$', params: { _splat: '' } })
    }
  },
  head: () => ({
    meta: [
      { title: 'Account | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerAccountRoute,
})

function OwnerAccountRoute() {
  const pathname = useLocation().pathname.replace(/\/$/u, '')
  const security = pathname === '/owner/settings/account/security' || pathname.startsWith('/owner/settings/account/security/')
  const profile = (
    <UserProfile
      routing="path"
      path="/owner/settings/account"
      appearance={{
        ...clerkEmbeddedProfileAppearance,
        elements: {
          ...clerkEmbeddedProfileAppearance.elements,
          navbar: { display: 'none' },
          navbarMobileMenuRow: { display: 'none !important' },
          navbarButton__apiKeys: { display: 'none' },
          ...(security ? {
            rootBox: { width: '100%', maxWidth: '100%' },
            cardBox: { width: '100%', maxWidth: '100%', boxShadow: 'none', borderRadius: 0 },
            card: { boxShadow: 'none', background: 'transparent' },
          } : {}),
        },
      }}
    >
      <UserProfile.Page label="account" />
      <UserProfile.Page label="security" />
      <UserProfile.Page label="apiKeys" />
    </UserProfile>
  )
  if (security) return <SecuritySettings content={profile} />
  return <SettingsPage title="Profile" description="Manage your identity and email.">
    <div className="min-w-0 max-w-full overflow-x-auto">{profile}</div>
  </SettingsPage>
}
