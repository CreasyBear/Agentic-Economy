import { useLocation, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useRef, useState } from 'react'

import { readProviderWorkspaceIdentityDetailServer, type ProviderWorkspaceIdentityDetailResult } from '@/components/ae/offerings/provider-workspace.functions'
import { focusSection } from '@/components/ae/offerings/provider-workspace-projection'
import { renameProviderDisplayNameServer } from '@/lib/server/owner-workspace.functions'
import { parseOwnerToolsCompatibilitySearch, parseOwnerToolsX402ConnectionSearch } from '@/lib/operator/supply-compatibility'
import { readOwnerProviderEarningsServer } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

type UseProviderWorkspaceSheetsInput = Readonly<{
  enabled: boolean
}>

export function useProviderWorkspaceSheets(input: UseProviderWorkspaceSheetsInput) {
  const location = useLocation()
  const router = useRouter()
  const readIdentityDetail = useServerFn(readProviderWorkspaceIdentityDetailServer)
  const readEarnings = useServerFn(readOwnerProviderEarningsServer)
  const renameProvider = useServerFn(renameProviderDisplayNameServer)

  const [identityOpen, setIdentityOpen] = useState(false)
  const [identityPending, setIdentityPending] = useState(false)
  const [identityDetail, setIdentityDetail] = useState<ProviderWorkspaceIdentityDetailResult>()
  const [earningsOpen, setEarningsOpen] = useState(false)
  const [earningsPending, setEarningsPending] = useState(false)
  const [earningsUnavailable, setEarningsUnavailable] = useState(false)
  const [earningsDetail, setEarningsDetail] = useState<OwnerProviderEarningsReadback>()
  const [earningsReadAt, setEarningsReadAt] = useState<number>()
  const earningsOpenRef = useRef(false)
  const earningsRequestPending = useRef(false)
  const lastEarningsRequest = useRef<Readonly<{ cursor?: string; append: boolean }>>({ append: false })

  const compatibilitySearch = location.search as Record<string, unknown>
  const validatedCompatibilitySearch = parseOwnerToolsCompatibilitySearch(compatibilitySearch)
  const x402Handoff = parseOwnerToolsX402ConnectionSearch(compatibilitySearch)
  const compatibilityConnect = validatedCompatibilitySearch.connect
  const compatibilityRebind = validatedCompatibilitySearch.rebind
  const compatibilityCursor = validatedCompatibilitySearch.cursor

  const requestEarnings = useCallback((request: Readonly<{ cursor?: string; append: boolean }>) => {
    if (!input.enabled || earningsRequestPending.current) return
    earningsRequestPending.current = true
    lastEarningsRequest.current = request
    setEarningsPending(true)
    setEarningsUnavailable(false)
    void readEarnings({ data: request.cursor === undefined ? {} : { cursor: request.cursor } })
      .then((next) => {
        if (next.kind === 'error' || next.kind === 'conflict') {
          // A failed continuation keeps previously observed records and retries this same cursor.
          setEarningsUnavailable(true)
          if (next.kind === 'error' && next.code === 'source_unavailable') setEarningsDetail(previous => previous ?? next)
          else setEarningsDetail(next)
          return
        }
        setEarningsDetail(previous => request.append && next.kind === 'available' && previous?.kind === 'available' && previous.businessId === next.businessId
          ? { ...next, obligations: [...new Map([...previous.obligations, ...next.obligations].map(row => [row.obligationRef, row])).values()] }
          : next)
        setEarningsReadAt(Date.now())
      })
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        setEarningsUnavailable(true)
      })
      .finally(() => { earningsRequestPending.current = false; setEarningsPending(false) })
  }, [input.enabled, readEarnings])

  const loadEarnings = useCallback(() => requestEarnings({ append: false }), [requestEarnings])
  const retryEarnings = useCallback(() => requestEarnings(lastEarningsRequest.current), [requestEarnings])
  const loadMoreEarnings = useCallback(() => {
    if (earningsDetail?.kind === 'available' && earningsDetail.isDone === false && earningsDetail.continueCursor) {
      requestEarnings({ cursor: earningsDetail.continueCursor, append: true })
    }
  }, [earningsDetail, requestEarnings])

  const openEarnings = useCallback(() => {
    if (!input.enabled) return
    setEarningsOpen(true)
    if (!earningsOpenRef.current) { earningsOpenRef.current = true; loadEarnings() }
  }, [input.enabled, loadEarnings])

  const closeEarnings = useCallback(() => {
    earningsOpenRef.current = false
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
    identityOpen,
    identityPending,
    identityDetail,
    earningsOpen,
    earningsPending,
    earningsUnavailable,
    earningsDetail,
    earningsReadAt,
    retryEarnings,
    loadMoreEarnings,
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
