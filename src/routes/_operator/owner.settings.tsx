import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AccountSettingsSection } from '@/components/ae/settings/OwnerSettingsSections'
import { OwnerSettingsShell } from '@/components/ae/settings/OwnerSettingsShell'
import { ownerSettingsCurrentForPath } from '@/lib/operator/settings-navigation'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAccountSecurityHistoryServer } from '@/modules/security/account-security.functions'

export const Route = createFileRoute('/_operator/owner/settings')({
  ...operatorRouteOptions,
  loader: async () => await readAccountSecurityHistoryServer({ data: {} }),
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
  const { pathname } = useLocation()
  const history = Route.useLoaderData()
  const current = ownerSettingsCurrentForPath(pathname)

  return (
    <OwnerSettingsShell current={current}>
      {pathname === '/owner/settings' ? <AccountSettingsSection history={history} /> : <Outlet />}
    </OwnerSettingsShell>
  )
}
