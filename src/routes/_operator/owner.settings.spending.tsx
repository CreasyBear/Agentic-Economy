import { createFileRoute } from '@tanstack/react-router'
import { SpendingSettingsPage } from '@/components/ae/settings/billing/SpendingSettingsPage'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/spending')({
  ...operatorRouteOptions,
  head: () => ({ meta: [{ title: 'Spending defaults | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: SpendingSettingsPage,
})
