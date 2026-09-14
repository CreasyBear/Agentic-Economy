import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Wallet } from 'lucide-react'

import { AeOwnerCredit, type AccountHistoryPort } from '@/components/ae/console/AeOwnerCredit'
import type { AccountFundingPort } from '@/components/ae/console/AeCreditTopUpPanel'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { operatorRouteOptions } from '@/lib/operator/route-options'
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
    const [nextDocuments, nextReconciliation, nextObligations] = await Promise.allSettled([
      readDocuments({ data: {} }),
      readReconciliation({ data: {} }),
      readObligations({ data: {} }),
    ])
    for (const result of [nextDocuments, nextReconciliation, nextObligations]) {
      if (result.status === 'rejected') captureClientExceptionOnClient(result.reason)
    }
    if (nextDocuments.status === 'fulfilled') setDocuments(nextDocuments.value.page)
    if (nextReconciliation.status === 'fulfilled') setReconciliationCases(nextReconciliation.value.page)
    if (nextObligations.status === 'fulfilled') setProviderObligations(nextObligations.value.page)
    setUnavailable((current) => ({
      ...current,
      documents: nextDocuments.status === 'rejected',
      reconciliation: nextReconciliation.status === 'rejected',
      obligations: nextObligations.status === 'rejected',
    }))
  }, [readDocuments, readObligations, readReconciliation])

  const load = useCallback(async () => {
    await Promise.all([loadBalance(), loadHistory(), loadConstraints(), loadAdministration()])
  }, [loadAdministration, loadBalance, loadConstraints, loadHistory])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Balance"
      description="Add AUD credit for paid Calls. Each Agent’s spending limit remains separate."
      currentPath="/owner/credit"
    >
      <AeSettingsStack>
        <AeOwnerCredit
          {...(accountBalance === undefined ? {} : { accountBalance })}
          {...(accountHistory === undefined ? {} : { accountHistory })}
          accountHistoryPort={accountHistoryPort}
          balanceLoading={balanceLoading}
          historyLoading={historyLoading}
          constraintsLoading={constraintsLoading}
          accountFundingPort={accountFundingPort}
          {...(fundingConstraints === undefined ? {} : { fundingConstraints })}
          onCreditRefresh={load}
          documents={documents}
          reconciliationCases={reconciliationCases}
          providerObligations={providerObligations}
          unavailable={unavailable}
          onCreateStatement={async () => {
            const now = new Date()
            const periodStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
            const periodEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
            const result = await createStatement({ data: { periodStart, periodEnd } })
            if (result.kind === 'refused') throw new Error(result.code)
            await loadAdministration()
          }}
          onCreateDailyClose={async () => {
            const today = new Date()
            const periodEnd = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
            const periodStart = periodEnd - 24 * 60 * 60 * 1_000
            const result = await createDailyClose({ data: { periodStart, periodEnd } })
            if (result.kind === 'refused') throw new Error(result.code)
            await loadAdministration()
          }}
          onSignDailyClose={async (documentRef: string, expectedRenderInputDigest: string) => {
            const result = await signDailyClose({ data: { documentRef, expectedRenderInputDigest } })
            if (result.kind === 'refused') throw new Error(result.code)
            await loadAdministration()
          }}
          onOpenDocument={async (documentRef: string) => {
            const url = await renderDocument({ data: { documentRef } })
            if (url === null) throw new Error('money_document_url_unavailable')
            window.open(url, '_blank', 'noopener,noreferrer')
          }}
        />
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
