import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'

import { AePayoutPolicyForm } from '@/components/ae/supply/AePayoutPolicyForm'
import { Skeleton } from '@/components/ui/skeleton'
import type { PayoutPreferencesRead } from '../../../../convex/moneyPayoutPolicy'

const readPayoutPreferencesRef = makeFunctionReference<
  'query',
  Readonly<{ businessId: string; currency: string }>,
  PayoutPreferencesRead
>('moneyPayoutPolicy:readPayoutPreferences')

const configurePayoutPreferencesRef = makeFunctionReference<
  'mutation',
  Readonly<{
    businessId: string
    currency: string
    minimumPayoutUnits: string
    schedule: 'monthly' | 'weekly' | 'manual'
    expectedRevision: number
  }>,
  { kind: 'updated'; revision: number } | { kind: 'conflict'; currentRevision: number }
>('moneyPayoutPolicy:configurePayoutPreferences')

export function ProviderWorkspacePayoutPolicyPanel({
  businessId,
  currency,
}: Readonly<{
  businessId: string
  currency: string
}>) {
  const preferences = useQuery(readPayoutPreferencesRef, {
    businessId,
    currency,
  })
  const configurePayoutPreferences = useMutation(configurePayoutPreferencesRef)

  if (preferences === undefined) {
    return <Skeleton className="min-h-[26rem] w-full" aria-busy="true" />
  }

  return (
    <AePayoutPolicyForm
      businessId={businessId}
      currency={currency}
      initialThresholdUnits={preferences.minimumPayoutUnits}
      initialSchedule={preferences.schedule}
      initialRevision={preferences.revision}
      onSavePreferences={async (params) => configurePayoutPreferences(params)}
    />
  )
}
