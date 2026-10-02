import { createFileRoute } from '@tanstack/react-router'

import { AeAccountSecurityHistory } from '@/components/ae/settings/AeAccountSecurityHistory'
import { AeCompromiseRecoveryChecklist } from '@/components/ae/settings/AeCompromiseRecoveryChecklist'
import { AeOwnerAdminBootstrap } from '@/components/ae/settings/AeOwnerAdminBootstrap'
import arcButtonStyles from '@/components/arc/button/button.module.css'
import { SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAccountSecurityHistoryServer } from '@/modules/security/account-security.functions'
import { readOwnerAdminBootstrapServer } from '@/modules/security/owner-admin-bootstrap.functions'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_operator/owner/settings/security-activity')({
  ...operatorRouteOptions,
  loader: async () => {
    const [history, bootstrap] = await Promise.all([
      readAccountSecurityHistoryServer({ data: {} }), readOwnerAdminBootstrapServer({ data: {} }),
    ])
    return { history, bootstrap }
  },
  head: () => ({ meta: [
    { title: 'Security activity | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: OwnerSecurityActivityRoute,
})

function OwnerSecurityActivityRoute() {
  const { history, bootstrap } = Route.useLoaderData()
  return <SettingsPage title="Security activity" description="Review account access and independent recovery steps."
    action={<a href="/owner/settings/account" className={cn(arcButtonStyles.button, arcButtonStyles.secondary, arcButtonStyles.md)}>Open profile</a>}>
    <AeOwnerAdminBootstrap initialStatus={bootstrap} />
    <AeCompromiseRecoveryChecklist />
    <AeAccountSecurityHistory initialResult={history} />
  </SettingsPage>
}
