import { createFileRoute } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'

import { AeOwnerCreditPage } from '@/components/ae/console/owner-credit/AeOwnerCreditPage'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/credit')({
  staticData: {
    nav: {
      label: 'Balance',
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
      { title: 'Balance | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerCreditRoute,
})

function OwnerCreditRoute() {
  return <AeOwnerCreditPage />
}
