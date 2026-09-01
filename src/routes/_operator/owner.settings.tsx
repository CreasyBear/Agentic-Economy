import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AccountSettingsSection } from '@/components/ae/settings/OwnerSettingsSections'
import { OwnerSettingsShell } from '@/components/ae/settings/OwnerSettingsShell'
import { ownerWorkspaceOwnerForPath } from '@/lib/operator/navigation'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAccountSecurityHistoryServer } from '@/modules/security/account-security.functions'

export const Route = createFileRoute('/_operator/owner/settings')({
  ...operatorRouteOptions,
  loader: async () => await readAccountSecurityHistoryServer({ data: {} }),
  head: () => ({
    meta: [
      { title: 'Account & security | Agentic Economy' },
      { name: 'description', content: 'Profile, authentication, sessions, recovery, and security.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsRoute,
})

function OwnerSettingsRoute() {
  const { pathname } = useLocation()
  const history = Route.useLoaderData()
  if (ownerWorkspaceOwnerForPath(pathname) !== 'account') return <Outlet />
  return (
    <OwnerSettingsShell>
      <AccountSettingsSection history={history} />
    </OwnerSettingsShell>
  )
}
