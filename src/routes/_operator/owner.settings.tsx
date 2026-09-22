import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AccountSettingsSection } from '@/components/ae/settings/OwnerSettingsSections'
import { OwnerSettingsShell } from '@/components/ae/settings/OwnerSettingsShell'
import { ownerWorkspaceOwnerForPath } from '@/lib/operator/roles'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAccountSecurityHistoryServer } from '@/modules/security/account-security.functions'

export const Route = createFileRoute('/_operator/owner/settings')({
  staticData: {
    nav: {
      label: 'Settings',
    },
  },
  ...operatorRouteOptions,
  loader: async () => await readAccountSecurityHistoryServer({ data: {} }),
  head: () => ({
    meta: [
      { title: 'Settings | Agentic Economy' },
      { name: 'description', content: 'Manage your owner profile, active sessions, recovery, and security history.' },
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
