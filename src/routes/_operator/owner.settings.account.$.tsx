import { UserProfile } from '@clerk/tanstack-react-start'
import { Link, createFileRoute, redirect, useLocation } from '@tanstack/react-router'

import { clerkEmbeddedProfileAppearance } from '@/components/ae/website/clerk-appearance'
import { SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { cn } from '@/lib/utils'

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
  return (
    <SettingsPage title={security ? 'Security' : 'Profile'} description={security ? 'Manage your sign-in security.' : 'Manage your identity and email.'}>
      <nav aria-label="Account pages" className="flex gap-2 md:hidden">
        {[
          { label: 'Profile', href: '/owner/settings/account' },
          { label: 'Security', href: '/owner/settings/account/security' },
        ].map(({ label, href }) => <Link key={href} to={href} activeOptions={{ exact: true }}
          className={cn('flex min-h-10 items-center rounded-md px-3 text-sm', (security ? label === 'Security' : label === 'Profile') ? 'bg-muted font-medium' : 'hover:underline')}
        >{label}</Link>)}
      </nav>
      <div className="min-w-0 max-w-full overflow-x-auto">
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
            },
          }}
        >
          <UserProfile.Page label="account" />
          <UserProfile.Page label="security" />
          <UserProfile.Page label="apiKeys" />
        </UserProfile>
      </div>
    </SettingsPage>
  )
}
