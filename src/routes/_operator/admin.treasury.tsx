import { createFileRoute } from '@tanstack/react-router'
import { AdminTreasuryPage } from '@/components/ae/admin/treasury/AdminTreasuryPage'
import { AdminTreasuryPageSkeleton, TREASURY_PAGE_DESCRIPTION } from '@/components/ae/admin/treasury/AdminTreasuryPageState'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/treasury')({
  ...operatorRouteOptions,
  pendingComponent: AdminTreasuryPageSkeleton,
  head: () => ({ meta: [
    { title: 'Treasury | Agentic Economy' }, { name: 'description', content: TREASURY_PAGE_DESCRIPTION }, { name: 'robots', content: 'noindex' },
  ] }),
  component: AdminTreasuryPage,
})
