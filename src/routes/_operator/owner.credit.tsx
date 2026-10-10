import { createFileRoute } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'

import { AeOwnerCreditPage } from '@/components/ae/console/owner-credit/AeOwnerCreditPage'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readOwnerAccountHistoryServer } from '@/lib/server/call-history.functions'
import {
  readOwnerMoneyDocumentsServer,
  readOwnerMoneyReconciliationServer,
  readOwnerProviderObligationsServer,
} from '@/lib/server/money-documents.functions'
import { readAccountFundingBalanceServer, readAccountFundingConstraintsServer } from '@/modules/money/money.functions'

export const Route = createFileRoute('/_operator/owner/credit')({
  staticData: {
    nav: {
      label: 'Credit',
      operator: {
        roles: ['owner'],
        group: 'Buy',
        groupOrder: 0,
        order: 2,
        icon: Wallet,
        tier: 'core',
      },
    },
  },
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: 'Credit | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  // Money reads start on entry only: a hover preload would fan out six reads
  // and could hand the page a balance as old as the preload stale window.
  preload: false,
  loader: () => {
    const reads = {
      balance: readAccountFundingBalanceServer(),
      history: readOwnerAccountHistoryServer({ data: {} }),
      constraints: readAccountFundingConstraintsServer(),
      documents: readOwnerMoneyDocumentsServer({ data: {} }),
      reconciliation: readOwnerMoneyReconciliationServer({ data: {} }),
      obligations: readOwnerProviderObligationsServer({ data: {} }),
    }
    // Unawaited so the page renders at once; the hook observes each rejection.
    for (const read of Object.values(reads)) read.catch(() => undefined)
    return reads
  },
  component: OwnerCreditRoute,
})

function OwnerCreditRoute() {
  return <AeOwnerCreditPage reads={Route.useLoaderData()} />
}
