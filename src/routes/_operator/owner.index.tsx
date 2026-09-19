import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboardIcon } from 'lucide-react'

import { AeOwnerOverview } from '@/components/ae/console/AeOwnerOverview'
import type { OwnerOverviewSnapshot } from '@/modules/principal-account/owner-overview.view-model'
import { readProviderWorkspacePublicStatusServer } from '@/components/ae/offerings/provider-workspace.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import { readOwnerCallsServer } from '@/lib/server/call-history.functions'
import { readAccountFundingBalanceServer } from '@/modules/money/money.functions'
import { projectCallSummaryPurchaseStatus } from '@/modules/capability-execution/call-receipt-view'

export const Route = createFileRoute('/_operator/owner/')({
  staticData: {
    nav: {
      label: 'Overview',
      operator: {
        roles: ['owner'],
        group: 'Workspace',
        groupOrder: -1,
        order: 0,
        icon: LayoutDashboardIcon,
        tier: 'core',
        mobilePrimary: true,
        mobileOrder: 0,
      },
    },
  },
  ...operatorRouteOptions,
  loader: async (): Promise<OwnerOverviewSnapshot> => {
    const [balance, calls, agents, provider] = await Promise.allSettled([
      readAccountFundingBalanceServer(),
      readOwnerCallsServer({ data: {} }),
      readAgentDirectoryServer(),
      readProviderWorkspacePublicStatusServer(),
    ])
    const balanceSnapshot: OwnerOverviewSnapshot['balance'] = balance.status === 'fulfilled' && balance.value.kind === 'available'
      ? { kind: 'available', amount: balance.value.balance, locked: balance.value.locked }
      : { kind: 'unavailable' }
    const callsSnapshot: OwnerOverviewSnapshot['calls'] = calls.status === 'fulfilled'
      ? { kind: 'available', attention: calls.value.page.filter(call => projectCallSummaryPurchaseStatus(call).attention).length, loaded: calls.value.page.length, complete: calls.value.isDone }
      : { kind: 'unavailable' }
    const agentsSnapshot: OwnerOverviewSnapshot['agents'] = agents.status === 'fulfilled'
      ? { kind: 'available', connected: agents.value.items.filter(agent => agent.status === 'connected' || agent.status === 'attention').length, complete: agents.value.nextCursor === undefined }
      : { kind: 'unavailable' }
    const providerSnapshot: OwnerOverviewSnapshot['provider'] = provider.status !== 'fulfilled' || provider.value.kind === 'unavailable'
      ? { kind: 'unavailable' }
      : provider.value.kind === 'not_applicable'
        ? undefined
        : provider.value.kind === 'available'
          ? { kind: 'available', name: provider.value.value.catalog.name, tools: provider.value.value.catalog.offerings.length }
          : { kind: 'attention' }
    return { balance: balanceSnapshot, calls: callsSnapshot, agents: agentsSnapshot, ...(providerSnapshot === undefined ? {} : { provider: providerSnapshot }) }
  },
  head: () => ({ meta: [{ title: 'Overview | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerOverviewRoute,
})

function OwnerOverviewRoute() {
  return <AeOwnerOverview snapshot={Route.useLoaderData()} />
}
