import { UserProfile } from '@clerk/tanstack-react-start'
import { Link, createFileRoute, redirect, useLocation } from '@tanstack/react-router'

import { clerkEmbeddedProfileAppearance } from '@/components/ae/website/clerk-appearance'
import { SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { SecuritySettings, SecuritySettingsNavigation } from '@/components/arc/blocks/security-settings/security-settings'
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
  const security = useLocation().pathname === '/owner/settings/account/security'
  const navigation = <SecuritySettingsNavigation
    activePage={security ? 'security' : 'profile'}
    profile={<Link to="/owner/settings/account/$" params={{ _splat: '' }} activeOptions={{ exact: true }} aria-current={security ? undefined : 'page'}>Profile</Link>}
    security={<Link to="/owner/settings/account/$" params={{ _splat: 'security' }} activeOptions={{ exact: true }} aria-current={security ? 'page' : undefined}>Security</Link>}
  />
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
  if (security) return <SecuritySettings navigation={navigation} content={profile} />
  return <SettingsPage title="Profile" description="Manage your identity and email.">
    {navigation}
    <div className="min-w-0 max-w-full overflow-x-auto">{profile}</div>
  </SettingsPage>
}
