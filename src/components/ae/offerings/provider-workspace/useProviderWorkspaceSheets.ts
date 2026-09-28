import { useLocation, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useState } from 'react'

import { readProviderWorkspaceIdentityDetailServer, type ProviderWorkspaceIdentityDetailResult } from '@/components/ae/offerings/provider-workspace.functions'
import { focusSection } from '@/components/ae/offerings/provider-workspace-projection'
import { renameProviderDisplayNameServer } from '@/lib/server/owner-workspace.functions'
import { parseOwnerToolsCompatibilitySearch, parseOwnerToolsX402ConnectionSearch } from '@/lib/operator/supply-compatibility'
import { readOwnerProviderEarningsServer } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'
import { readOwnerConnectReadinessServer } from '@/modules/money/money.functions'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

type UseProviderWorkspaceSheetsInput = Readonly<{
  enabled: boolean
}>

export function useProviderWorkspaceSheets(input: UseProviderWorkspaceSheetsInput) {
  const location = useLocation()
  const router = useRouter()
  const readIdentityDetail = useServerFn(readProviderWorkspaceIdentityDetailServer)
  const readEarnings = useServerFn(readOwnerProviderEarningsServer)
  const readConnect = useServerFn(readOwnerConnectReadinessServer)
  const renameProvider = useServerFn(renameProviderDisplayNameServer)

  const [identityOpen, setIdentityOpen] = useState(false)
  const [identityPending, setIdentityPending] = useState(false)
  const [identityDetail, setIdentityDetail] = useState<ProviderWorkspaceIdentityDetailResult>()
  const [earningsOpen, setEarningsOpen] = useState(false)
  const [earningsPending, setEarningsPending] = useState(false)
  const [earningsUnavailable, setEarningsUnavailable] = useState(false)
  const [earningsDetail, setEarningsDetail] = useState<OwnerProviderEarningsReadback>()

  const compatibilitySearch = location.search as Record<string, unknown>
  const validatedCompatibilitySearch = parseOwnerToolsCompatibilitySearch(compatibilitySearch)
  const x402Handoff = parseOwnerToolsX402ConnectionSearch(compatibilitySearch)
  const compatibilityConnect = validatedCompatibilitySearch.connect
  const compatibilityRebind = validatedCompatibilitySearch.rebind
  const compatibilityCursor = validatedCompatibilitySearch.cursor

  const loadEarnings = useCallback(() => {
    if (!input.enabled || earningsPending) return
    setEarningsPending(true)
    setEarningsUnavailable(false)
    void readEarnings()
      .then(setEarningsDetail)
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        setEarningsUnavailable(true)
      })
      .finally(() => setEarningsPending(false))
  }, [earningsPending, input.enabled, readEarnings])

  const openEarnings = useCallback(() => {
    if (!input.enabled) return
    setEarningsOpen(true)
    if (earningsDetail === undefined && !earningsUnavailable) loadEarnings()
  }, [earningsDetail, earningsUnavailable, input.enabled, loadEarnings])

  const closeEarnings = useCallback(() => {
    setEarningsOpen(false)
  }, [])

  const loadIdentity = useCallback(() => {
    if (!input.enabled || identityPending) return
    setIdentityPending(true)
    void readIdentityDetail()
      .then(setIdentityDetail)
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        setIdentityDetail({ kind: 'unavailable' })
      })
      .finally(() => setIdentityPending(false))
  }, [identityPending, input.enabled, readIdentityDetail])

  const openIdentity = useCallback(() => {
    if (!input.enabled) return
    setIdentityOpen(true)
    if (identityDetail === undefined) loadIdentity()
  }, [identityDetail, input.enabled, loadIdentity])

  useEffect(() => {
    if (!input.enabled) return
    if (location.hash === 'earnings' || compatibilityConnect === 'return' || compatibilityConnect === 'refresh') openEarnings()
    if (location.hash === 'provider-identity') openIdentity()
  }, [compatibilityConnect, input.enabled, location.hash, openEarnings, openIdentity])

  useEffect(() => {
    if (!input.enabled) return
    if (location.hash === 'earnings' && earningsOpen) focusSection('earnings')
  }, [earningsOpen, input.enabled, location.hash])

  const onRename = useCallback(async (renameInput: Readonly<{ businessId: string; name: string; requestKey: string }>) => {
    const renamed = await renameProvider({ data: renameInput })
    if (renamed.kind === 'updated' || renamed.kind === 'unchanged') await router.invalidate()
    return renamed
  }, [renameProvider, router])

  return {
    compatibilityConnect,
    compatibilityCursor,
    compatibilityRebind,
    x402Handoff,
    readConnect,
    identityOpen,
    identityPending,
    identityDetail,
    earningsOpen,
    earningsPending,
    earningsUnavailable,
    earningsDetail,
    openEarnings,
    closeEarnings,
    loadEarnings,
    openIdentity,
    loadIdentity,
    onRename,
    onStatusRefreshed: () => void router.invalidate(),
    onResumeVerification: () => {
      openEarnings()
      focusSection('earnings')
    },
    onReadinessAchieved: () => void router.invalidate(),
  }
}
