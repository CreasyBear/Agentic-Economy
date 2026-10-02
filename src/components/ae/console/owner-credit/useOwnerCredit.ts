import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import type { AeOwnerCreditProps } from '@/components/ae/console/owner-credit/owner-credit.contracts'
import type { AccountFundingPort } from '@/modules/money/account-funding.contracts'
import type { AccountHistoryPort } from '@/modules/money/account-history.contracts'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readOwnerAccountHistoryServer } from '@/lib/server/call-history.functions'
import {
  createOwnerStatementServer,
  createOwnerDailyCloseServer,
  readOwnerProviderObligationsServer,
  readOwnerMoneyDocumentsServer,
  readOwnerMoneyReconciliationServer,
  renderOwnerMoneyDocumentServer,
  signOwnerDailyCloseServer,
  type MoneyDocumentView,
  type MoneyProviderObligationView,
  type MoneyReconciliationCaseView,
} from '@/lib/server/money-documents.functions'
import {
  beginAccountFundingServer,
  readAccountFundingBalanceServer,
  readAccountFundingConstraintsServer,
  readAccountFundingServer,
} from '@/modules/money/money.functions'
import type { AccountHistoryResult } from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingConstraints } from '@/modules/money/server'

export function useOwnerCredit(): AeOwnerCreditProps {
  const beginAccountFunding = useServerFn(beginAccountFundingServer)
  const readAccountFunding = useServerFn(readAccountFundingServer)
  const readAccountBalance = useServerFn(readAccountFundingBalanceServer)
  const readAccountHistory = useServerFn(readOwnerAccountHistoryServer)
  const readFundingConstraints = useServerFn(readAccountFundingConstraintsServer)
  const readDocuments = useServerFn(readOwnerMoneyDocumentsServer)
  const readReconciliation = useServerFn(readOwnerMoneyReconciliationServer)
  const readObligations = useServerFn(readOwnerProviderObligationsServer)
  const createStatement = useServerFn(createOwnerStatementServer)
  const createDailyClose = useServerFn(createOwnerDailyCloseServer)
  const signDailyClose = useServerFn(signOwnerDailyCloseServer)
  const renderDocument = useServerFn(renderOwnerMoneyDocumentServer)
  const accountFundingPort = useMemo<AccountFundingPort>(() => ({
    begin: (data) => beginAccountFunding({ data }),
    read: (data) => readAccountFunding({ data }),
  }), [beginAccountFunding, readAccountFunding])
  const accountHistoryPort = useMemo<AccountHistoryPort>(() => ({
    read: (data) => readAccountHistory({ data }),
  }), [readAccountHistory])
  const [accountBalance, setAccountBalance] = useState<AccountFundingBalance>()
  const [accountHistory, setAccountHistory] = useState<AccountHistoryResult>()
  const [documents, setDocuments] = useState<readonly MoneyDocumentView[]>([])
  const [reconciliationCases, setReconciliationCases] = useState<readonly MoneyReconciliationCaseView[]>([])
  const [providerObligations, setProviderObligations] = useState<readonly MoneyProviderObligationView[]>([])
  const [fundingConstraints, setFundingConstraints] = useState<AccountFundingConstraints>()
  const [balanceLoading, setBalanceLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [constraintsLoading, setConstraintsLoading] = useState(true)
  const [administrationLoading, setAdministrationLoading] = useState(true)
  const administrationRequest = useRef(0)
  const [unavailable, setUnavailable] = useState({
    balance: false,
    history: false,
    documents: false,
    reconciliation: false,
    obligations: false,
    constraints: false,
  })

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true)
    try {
      const nextBalance = await readAccountBalance()
      setAccountBalance((current) => nextBalance.kind === 'available' ? nextBalance : current ?? nextBalance)
      setUnavailable((current) => ({ ...current, balance: nextBalance.kind !== 'available' }))
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setUnavailable((current) => ({ ...current, balance: true }))
    } finally {
      setBalanceLoading(false)
    }
  }, [readAccountBalance])

  useEffect(() => {
    const expiry = accountBalance?.kind === 'available' ? accountBalance.nextPromotionalExpiryAt : undefined
    if (expiry == null) return
    const timer = window.setTimeout(() => { void loadBalance() }, Math.min(2_147_483_647, Math.max(0, expiry - Date.now())))
    return () => window.clearTimeout(timer)
  }, [accountBalance, loadBalance])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const nextHistory = await readAccountHistory({ data: {} })
      setAccountHistory((current) => nextHistory.kind === 'available' ? nextHistory : current ?? nextHistory)
      setUnavailable((current) => ({ ...current, history: nextHistory.kind !== 'available' }))
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setUnavailable((current) => ({ ...current, history: true }))
    } finally {
      setHistoryLoading(false)
    }
  }, [readAccountHistory])


  const loadConstraints = useCallback(async () => {
    setConstraintsLoading(true)
    try {
      const nextConstraints = await readFundingConstraints()
      setFundingConstraints(nextConstraints)
      setUnavailable((current) => ({ ...current, constraints: false }))
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setUnavailable((current) => ({ ...current, constraints: true }))
    } finally {
      setConstraintsLoading(false)
    }
  }, [readFundingConstraints])

  const loadAdministration = useCallback(async () => {
    const request = ++administrationRequest.current
    setAdministrationLoading(true)
    const [nextDocuments, nextReconciliation, nextObligations] = await Promise.allSettled([
      readDocuments({ data: {} }),
      readReconciliation({ data: {} }),
      readObligations({ data: {} }),
    ])
    for (const result of [nextDocuments, nextReconciliation, nextObligations]) {
      if (result.status === 'rejected') captureClientExceptionOnClient(result.reason)
    }
    if (request !== administrationRequest.current) return
    if (nextDocuments.status === 'fulfilled') setDocuments(nextDocuments.value.page)
    if (nextReconciliation.status === 'fulfilled') setReconciliationCases(nextReconciliation.value.page)
    if (nextObligations.status === 'fulfilled') setProviderObligations(nextObligations.value.page)
    setUnavailable((current) => ({
      ...current,
      documents: nextDocuments.status === 'rejected',
      reconciliation: nextReconciliation.status === 'rejected',
      obligations: nextObligations.status === 'rejected',
    }))
    setAdministrationLoading(false)
  }, [readDocuments, readObligations, readReconciliation])

  const load = useCallback(async () => {
    await Promise.all([loadBalance(), loadHistory(), loadConstraints(), loadAdministration()])
  }, [loadAdministration, loadBalance, loadConstraints, loadHistory])


  useEffect(() => {
    void load()
    return () => { administrationRequest.current += 1 }
  }, [load])

  return {
    ...(accountBalance === undefined ? {} : { accountBalance }),
    ...(accountHistory === undefined ? {} : { accountHistory }),
    accountHistoryPort,
    balanceLoading,
    historyLoading,
    constraintsLoading,
    administrationLoading,
    accountFundingPort,
    ...(fundingConstraints === undefined ? {} : { fundingConstraints }),
    onCreditRefresh: load,
    documents,
    reconciliationCases,
    providerObligations,
    unavailable,
    onCreateStatement: async () => {
      const now = new Date()
      const periodStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      const periodEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
      const result = await createStatement({ data: { periodStart, periodEnd } })
      if (result.kind === 'refused') throw new Error(result.code)
      await loadAdministration()
    },
    onCreateDailyClose: async () => {
      const today = new Date()
      const periodEnd = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
      const periodStart = periodEnd - 24 * 60 * 60 * 1_000
      const result = await createDailyClose({ data: { periodStart, periodEnd } })
      if (result.kind === 'refused') throw new Error(result.code)
      await loadAdministration()
    },
    onSignDailyClose: async (documentRef: string, expectedRenderInputDigest: string) => {
      const result = await signDailyClose({ data: { documentRef, expectedRenderInputDigest } })
      if (result.kind === 'refused') throw new Error(result.code)
      await loadAdministration()
    },
    onOpenDocument: async (documentRef: string) => {
      const url = await renderDocument({ data: { documentRef } })
      if (url === null) throw new Error('money_document_url_unavailable')
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  }
}
