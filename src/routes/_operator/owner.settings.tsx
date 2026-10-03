import { Outlet, createFileRoute, redirect, useLocation } from '@tanstack/react-router'
import { SettingsShell } from '@/components/ae/settings/settings-shell/SettingsShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings')({
  ...operatorRouteOptions,
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/$/u, '') === '/owner/settings') {
      throw redirect({ to: '/owner/settings/workspace', replace: true })
    }
  },
  head: () => ({
    meta: [
      { title: 'Settings | Agentic Economy' },
      { name: 'description', content: 'Manage your account, workspace and preferences.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsRoute,
})

function OwnerSettingsRoute() {
  const { pathname } = useLocation()
  return <SettingsShell pathname={pathname}>
    <Outlet />
  </SettingsShell>
}
