import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import type { SortingState } from '@tanstack/react-table'
import { useCallback, useEffect, useState } from 'react'

import { ensureProviderBusinessServer } from '@/components/ae/offerings/provider-identity.functions'
import type { ProviderWorkspacePayoutResult } from '@/components/ae/offerings/provider-workspace.functions'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { AeProviderWorkspaceProps, OnboardingSaveResult } from './provider-workspace.contracts'
import { providerWorkspacePayoutConnection } from './provider-workspace.view-model'

type UseProviderWorkspaceInventoryInput = Readonly<{
  inventory: AeProviderWorkspaceProps['inventory']
  payouts: AeProviderWorkspaceProps['payouts']
}>

export function useProviderWorkspaceInventory(input: UseProviderWorkspaceInventoryInput) {
  const router = useRouter()
  const ensureProviderBusiness = useServerFn(ensureProviderBusinessServer)
  const [refreshPending, setRefreshPending] = useState(false)
  const refresh = useCallback(() => {
    if (refreshPending) return
    setRefreshPending(true)
    void router.invalidate()
      .catch((cause) => captureClientExceptionOnClient(cause))
      .finally(() => setRefreshPending(false))
  }, [refreshPending, router])

  const onSaveProfile = useCallback(async ({ name, website }: Readonly<{ name: string; website: string }>): Promise<OnboardingSaveResult> => {
    try {
      const parsedUrl = new URL(website)
      const created = await ensureProviderBusiness({
        data: {
          name,
          slug: name,
          website: parsedUrl.origin,
          providerIdentifier: parsedUrl.hostname,
        },
      })
      if (created.kind === 'refused') {
        const message =
          created.code === 'unauthenticated'
            ? 'Sign in required. Sign in as the workspace owner, then save again.'
            : created.code === 'slug_taken'
              ? 'That provider name is already taken. Choose a different supplier / brand name.'
              : 'Could not save provider profile. Review name and website, then try again.'
        return { kind: 'error', message }
      }
      await router.invalidate()
      return { kind: 'ok' }
    } catch (cause) {
      void cause
      return {
        kind: 'error',
        message: 'Could not save provider profile. Please check connection and try again.',
      }
    }
  }, [ensureProviderBusiness, router])

  const [inventoryFilter, setInventoryFilter] = useState('')
  const [inventorySorting, setInventorySorting] = useState<SortingState>([])
  const [activeRowActionId, setActiveRowActionId] = useState<string>()
  const [payoutSummary, setPayoutSummary] = useState<ProviderWorkspacePayoutResult>()

  useEffect(() => {
    setPayoutSummary(undefined)
    if (input.payouts === undefined) return
    void input.payouts
      .then(setPayoutSummary)
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        setPayoutSummary({ kind: 'unavailable' })
      })
  }, [input.payouts])

  const payoutConnection = providerWorkspacePayoutConnection({
    result: payoutSummary,
    pending: input.payouts !== undefined && payoutSummary === undefined,
  })

  return {
    refresh,
    refreshPending,
    onSaveProfile,
    payoutConnection,
    inventoryFilter,
    setInventoryFilter,
    inventorySorting,
    setInventorySorting,
    activeRowActionId,
    setActiveRowActionId,
  }
}
