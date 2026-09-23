import { useLocation, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useState } from 'react'

import {
  readProviderWorkspaceConnectionsDetailServer,
  readProviderWorkspaceIdentityDetailServer,
} from '@/components/ae/offerings/provider-workspace.functions'
import type {
  ProviderWorkspaceConnectionsDetailResult,
  ProviderWorkspaceIdentityDetailResult,
} from '@/components/ae/offerings/provider-workspace.functions'
import { focusSection } from '@/components/ae/offerings/provider-workspace-projection'
import { renameProviderDisplayNameServer } from '@/lib/server/owner-workspace.functions'
import { parseOwnerToolsCompatibilitySearch, parseOwnerToolsX402ConnectionSearch } from '@/lib/operator/supply-compatibility'
import { readOwnerProviderEarningsServer } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'
import { readOwnerConnectReadinessServer } from '@/modules/money/money.functions'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

type UseProviderWorkspaceSheetsInput = Readonly<{
  enabled: boolean
}>

export function useProviderWorkspaceSheets(input: UseProviderWorkspaceSheetsInput) {
  const location = useLocation()
  const router = useRouter()
  const readConnectionsDetail = useServerFn(readProviderWorkspaceConnectionsDetailServer)
  const readIdentityDetail = useServerFn(readProviderWorkspaceIdentityDetailServer)
  const readEarnings = useServerFn(readOwnerProviderEarningsServer)
  const readConnect = useServerFn(readOwnerConnectReadinessServer)
  const renameProvider = useServerFn(renameProviderDisplayNameServer)

  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const [connectionsPending, setConnectionsPending] = useState(false)
  const [connectionsDetail, setConnectionsDetail] = useState<ProviderWorkspaceConnectionsDetailResult>()
  const [connectionTargetMissing, setConnectionTargetMissing] = useState(false)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [identityPending, setIdentityPending] = useState(false)
  const [identityDetail, setIdentityDetail] = useState<ProviderWorkspaceIdentityDetailResult>()
  const [earningsOpen, setEarningsOpen] = useState(false)
  const [earningsPending, setEarningsPending] = useState(false)
  const [earningsUnavailable, setEarningsUnavailable] = useState(false)
  const [earningsDetail, setEarningsDetail] = useState<Readonly<{ earnings: OwnerProviderEarningsReadback; connect: OwnerConnectReadinessReadback }>>()

  const compatibilitySearch = location.search as Record<string, unknown>
  const validatedCompatibilitySearch = parseOwnerToolsCompatibilitySearch(compatibilitySearch)
  const x402Handoff = parseOwnerToolsX402ConnectionSearch(compatibilitySearch)
  const hasX402Handoff = x402Handoff !== undefined
  const compatibilityConnect = validatedCompatibilitySearch.connect
  const compatibilityCursor = validatedCompatibilitySearch.cursor

  const loadConnections = useCallback(() => {
    if (!input.enabled || connectionsPending) return
    setConnectionsPending(true)
    void readConnectionsDetail()
      .then(setConnectionsDetail)
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        setConnectionsDetail({ kind: 'unavailable' })
      })
      .finally(() => setConnectionsPending(false))
  }, [connectionsPending, input.enabled, readConnectionsDetail])

  const openConnections = useCallback(() => {
    if (!input.enabled) return
    setConnectionsOpen(true)
    if (connectionsDetail === undefined) loadConnections()
  }, [connectionsDetail, input.enabled, loadConnections])

  const closeConnections = useCallback(() => {
    setConnectionsOpen(false)
  }, [])

  const loadEarnings = useCallback(() => {
    if (!input.enabled || earningsPending) return
    setEarningsPending(true)
    setEarningsUnavailable(false)
    void Promise.all([readEarnings(), readConnect()])
      .then(([earnings, connect]) => setEarningsDetail({ earnings, connect }))
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        setEarningsUnavailable(true)
      })
      .finally(() => setEarningsPending(false))
  }, [earningsPending, input.enabled, readConnect, readEarnings])

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

  const connectPayoutsReady =
    earningsDetail?.connect?.kind === 'available'
    && earningsDetail.connect.accounts.some((account) => account.account.state === 'ready')

  useEffect(() => {
    if (!input.enabled) return
    if (location.hash.startsWith('provider-connection-')) openConnections()
    if (hasX402Handoff) openConnections()
    if (location.hash === 'earnings' || compatibilityConnect === 'return' || compatibilityConnect === 'refresh') openEarnings()
    if (location.hash === 'provider-identity') openIdentity()
  }, [compatibilityConnect, hasX402Handoff, input.enabled, location.hash, openConnections, openEarnings, openIdentity])

  useEffect(() => {
    if (!input.enabled) return
    if (!connectionsOpen || connectionsDetail?.kind !== 'available' || !location.hash.startsWith('provider-connection-')) return
    const target = document.getElementById(location.hash)
    if (target !== null) {
      target.setAttribute('tabindex', '-1')
      target.focus()
      setConnectionTargetMissing(false)
      return
    }
    setConnectionTargetMissing(true)
    focusSection('provider-connections')
  }, [connectionsDetail, connectionsOpen, input.enabled, location.hash])

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
    connectPayoutsReady,
    compatibilityConnect,
    compatibilityCursor,
    x402Handoff,
    readConnect,
    connectionsOpen,
    connectionsPending,
    connectionsDetail,
    connectionTargetMissing,
    identityOpen,
    identityPending,
    identityDetail,
    earningsOpen,
    earningsPending,
    earningsDetail,
    openConnections,
    closeConnections,
    loadConnections,
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
