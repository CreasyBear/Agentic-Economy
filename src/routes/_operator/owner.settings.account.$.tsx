import { UserProfile } from '@clerk/tanstack-react-start'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { OwnerSettingsShell } from '@/components/ae/settings/OwnerSettingsShell'
import { clerkEmbeddedProfileAppearance } from '@/components/ae/website/clerk-appearance'
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
  return (
    <OwnerSettingsShell currentPath="/owner/settings/account">
      <div className="min-w-0 max-w-full overflow-x-auto">
        <UserProfile
          routing="path"
          path="/owner/settings/account"
          appearance={{
            ...clerkEmbeddedProfileAppearance,
            elements: {
              ...clerkEmbeddedProfileAppearance.elements,
              navbarButton__apiKeys: { display: 'none' },
            },
          }}
        >
          <UserProfile.Page label="account" />
          <UserProfile.Page label="security" />
          <UserProfile.Page label="apiKeys" />
        </UserProfile>
      </div>
    </OwnerSettingsShell>
  )
}
