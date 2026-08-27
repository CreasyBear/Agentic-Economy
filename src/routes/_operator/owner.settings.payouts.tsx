import { createFileRoute, useRouter } from '@tanstack/react-router'

import { AeSupplyEarningsCard } from '@/components/ae/supply/AeSupplyEarningsCard'
import { AeSection } from '@/components/ae/layout/AeSection'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readOwnerConnectReadinessServer } from '@/modules/money/server'
import { readOwnerProviderEarningsServer } from '@/modules/capability-supply/supply-funnel.functions'

export const Route = createFileRoute('/_operator/owner/settings/payouts')({
  ...operatorRouteOptions,
  loader: async () => {
    const [earnings, connect] = await Promise.all([
      readOwnerProviderEarningsServer(),
      readOwnerConnectReadinessServer(),
    ])
    return { earnings, connect }
  },
  head: () => ({
    meta: [
      { title: 'Payouts | Agentic Economy' },
      { name: 'description', content: 'Supplier earnings and payout setup.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsPayoutsRoute,
})

function OwnerSettingsPayoutsRoute() {
  const { earnings, connect } = Route.useLoaderData()
  const router = useRouter()
  return (
    <AeSection
      title="Earnings and payouts"
      description="Setup or test calls do not create earnings. Accruals appear only when source money records them."
    >
      <AeSupplyEarningsCard
        readback={earnings}
        connect={connect}
        onStatusRefreshed={() => router.invalidate()}
      />
    </AeSection>
  )
}
