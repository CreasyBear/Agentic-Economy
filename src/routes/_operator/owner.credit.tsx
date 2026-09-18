import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation, useQuery } from 'convex/react'
import { Wallet } from 'lucide-react'

import { api } from '../../../convex/_generated/api'

import { AeOwnerCredit, type AccountHistoryPort } from '@/components/ae/console/AeOwnerCredit'
import type { AccountFundingPort } from '@/components/ae/console/AeCreditTopUpPanel'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readOwnerAccountHistoryServer, readOwnerSpendServer } from '@/lib/server/call-history.functions'
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
  createStripeCustomerPortalSessionServer,
  readAccountFundingBalanceServer,
  readAccountFundingConstraintsServer,
  readAccountFundingServer,
  readSavedPaymentMethodSummaryServer,
  readStripeReceiptUrlServer,
  type SavedPaymentMethodSummaryRead,
} from '@/modules/money/money.functions'
import type { AeInvoiceHistoryRow } from '@/components/ae/console/AeInvoiceHistoryTable'
import type { SavedPaymentMethodsSummary } from '@/components/ae/console/AeSavedPaymentMethodsCard'
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
  const invoiceHistoryRead = useQuery(api.moneyAccountFunding.listOwnerInvoiceHistory)
  const autoRechargeRead = useQuery(api.moneyAutoRecharge.readAutoRechargeSettings)
  const configureAutoRecharge = useMutation(api.moneyAutoRecharge.configureAutoRecharge)
  const monthlySpendBudgetRead = useQuery(api.moneyMonthlySpendBudget.readMonthlySpendBudget)
  const configureMonthlySpendBudget = useMutation(api.moneyMonthlySpendBudget.configureMonthlySpendBudget)
  const beginAccountFunding = useServerFn(beginAccountFundingServer)
  const readAccountFunding = useServerFn(readAccountFundingServer)
  const readAccountBalance = useServerFn(readAccountFundingBalanceServer)
  const readAccountHistory = useServerFn(readOwnerAccountHistoryServer)
  const readFundingConstraints = useServerFn(readAccountFundingConstraintsServer)
  const readSavedPaymentMethods = useServerFn(readSavedPaymentMethodSummaryServer)
  const createStripeCustomerPortalSession = useServerFn(createStripeCustomerPortalSessionServer)
  const readDocuments = useServerFn(readOwnerMoneyDocumentsServer)
  const readReconciliation = useServerFn(readOwnerMoneyReconciliationServer)
  const readObligations = useServerFn(readOwnerProviderObligationsServer)
  const createStatement = useServerFn(createOwnerStatementServer)
  const createDailyClose = useServerFn(createOwnerDailyCloseServer)
  const signDailyClose = useServerFn(signOwnerDailyCloseServer)
  const renderDocument = useServerFn(renderOwnerMoneyDocumentServer)
  const readStripeReceiptUrl = useServerFn(readStripeReceiptUrlServer)
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
  const [savedPaymentMethodsSummary, setSavedPaymentMethodsSummary] = useState<SavedPaymentMethodsSummary>()
  const [savedPaymentMethodsMandateState, setSavedPaymentMethodsMandateState] = useState<
    'missing' | 'ready' | 'authentication_required' | 'failed'
  >('missing')
  const [autoRechargePendingTopup, setAutoRechargePendingTopup] = useState<
    Readonly<{ commandRef: string }> | null | undefined
  >(undefined)
  const [savedPaymentMethodsLoading, setSavedPaymentMethodsLoading] = useState(true)
  const [monthlySpendMonthSpend, setMonthlySpendMonthSpend] = useState<
    Readonly<{ kind: 'available' | 'empty' | 'unavailable'; spendUnits?: string }>
  >({ kind: 'unavailable' })
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
      if (nextBalance.kind === 'available') {
        setAutoRechargePendingTopup(
          nextBalance.pendingTopup === undefined ? undefined : nextBalance.pendingTopup,
        )
      }
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

  const loadSavedPaymentMethods = useCallback(async () => {
    setSavedPaymentMethodsLoading(true)
    try {
      const summary: SavedPaymentMethodSummaryRead = await readSavedPaymentMethods()
      if (summary.kind === 'refused') {
        setSavedPaymentMethodsMandateState('missing')
        setSavedPaymentMethodsSummary({ kind: 'missing', hasPaymentMethod: false })
        return
      }
      setSavedPaymentMethodsMandateState(summary.mandateState)
      if (summary.kind === 'ready' && summary.hasPaymentMethod) {
        setSavedPaymentMethodsSummary({
          kind: 'ready',
          hasPaymentMethod: true,
          card: summary.card,
        })
      } else {
        setSavedPaymentMethodsSummary({ kind: 'missing', hasPaymentMethod: false })
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setSavedPaymentMethodsMandateState('missing')
      setSavedPaymentMethodsSummary({ kind: 'missing', hasPaymentMethod: false })
    } finally {
      setSavedPaymentMethodsLoading(false)
    }
  }, [readSavedPaymentMethods])

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
    await Promise.all([
      loadBalance(),
      loadHistory(),
      loadConstraints(),
      loadAdministration(),
      loadSavedPaymentMethods(),
    ])
  }, [loadAdministration, loadBalance, loadConstraints, loadHistory, loadSavedPaymentMethods])

  const loadMonthlySpend = useCallback(async () => {
    if (monthlySpendBudgetRead?.enabled !== true) {
      setMonthlySpendMonthSpend({ kind: 'empty' })
      return
    }
    const periodStart = new Date().toISOString().slice(0, 7)
    try {
      const spend = await readOwnerSpendServer({
        data: { dimensionKind: 'account', periodKind: 'month', periodStart },
      })
      if (spend.kind === 'available') {
        setMonthlySpendMonthSpend({ kind: 'available', spendUnits: spend.spendUnits })
        return
      }
      if (spend.kind === 'empty') {
        setMonthlySpendMonthSpend({ kind: 'empty', spendUnits: '0' })
        return
      }
      setMonthlySpendMonthSpend({ kind: 'unavailable' })
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setMonthlySpendMonthSpend({ kind: 'unavailable' })
    }
  }, [monthlySpendBudgetRead?.enabled])

  const handleSaveMonthlySpendCeiling = useCallback(async (settings: Readonly<{
    enabled: boolean
    ceilingUnits: string
    expectedRevision: number
  }>) => {
    const correlationRef = `owner-credit:monthly-spend-ceiling:${Date.now()}`
    await configureMonthlySpendBudget({
      enabled: settings.enabled,
      ceilingUnits: settings.ceilingUnits,
      expectedRevision: settings.expectedRevision,
      correlationRef,
      idempotencyRef: correlationRef,
    })
    await loadMonthlySpend()
  }, [configureMonthlySpendBudget, loadMonthlySpend])

  const handleSaveAutoRecharge = useCallback(async (settings: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    expectedRevision: number
  }>) => {
    const correlationRef = `owner-credit:auto-recharge:${Date.now()}`
    await configureAutoRecharge({
      enabled: settings.enabled,
      thresholdUnits: settings.thresholdUnits,
      rechargeAmountUnits: settings.rechargeAmountUnits,
      expectedRevision: settings.expectedRevision,
      correlationRef,
      idempotencyRef: correlationRef,
    })
  }, [configureAutoRecharge])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadMonthlySpend()
  }, [loadMonthlySpend])

  const autoRechargeSettings = autoRechargeRead === undefined
    ? undefined
    : {
        enabled: autoRechargeRead.enabled,
        thresholdUnits: autoRechargeRead.thresholdUnits,
        rechargeAmountUnits: autoRechargeRead.rechargeAmountUnits,
        revision: autoRechargeRead.revision,
      }

  const invoiceHistoryRows = useMemo<readonly AeInvoiceHistoryRow[] | undefined>(() => {
    if (invoiceHistoryRead === undefined) return undefined
    return invoiceHistoryRead.page
  }, [invoiceHistoryRead])

  const monthlySpendCeilingSettings = monthlySpendBudgetRead === undefined
    ? undefined
    : {
        enabled: monthlySpendBudgetRead.enabled,
        ceilingUnits: monthlySpendBudgetRead.ceilingUnits,
        revision: monthlySpendBudgetRead.revision,
      }

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
          {...(autoRechargeSettings === undefined ? {} : { autoRechargeSettings })}
          autoRechargeMandateState={savedPaymentMethodsMandateState}
          {...(autoRechargePendingTopup === undefined ? {} : { autoRechargePendingTopup })}
          onSaveAutoRecharge={handleSaveAutoRecharge}
          {...(monthlySpendCeilingSettings === undefined ? {} : { monthlySpendCeilingSettings })}
          monthlySpendMonthSpend={monthlySpendMonthSpend}
          onSaveMonthlySpendCeiling={handleSaveMonthlySpendCeiling}
          {...(savedPaymentMethodsSummary === undefined ? {} : { savedPaymentMethodsSummary })}
          savedPaymentMethodsLoading={savedPaymentMethodsLoading}
          onManageSavedPaymentMethods={async () => {
            const result = await createStripeCustomerPortalSession()
            if (result.kind === 'refused') {
              throw new Error(result.code)
            }
            await loadSavedPaymentMethods()
            return { portalUrl: result.portalUrl }
          }}
          {...(invoiceHistoryRows === undefined ? {} : { invoiceHistoryRows })}
          invoiceHistoryLoading={invoiceHistoryRead === undefined}
          onDownloadTaxInvoice={async (row) => {
            const documentRef = row.taxInvoice?.kind === 'issued' ? row.taxInvoice.documentRef : undefined
            if (documentRef === undefined) return
            const url = await renderDocument({ data: { documentRef } })
            if (url === null) throw new Error('money_document_url_unavailable')
            window.open(url, '_blank', 'noopener,noreferrer')
          }}
          onViewStripeReceipt={async (row) => {
            const result = await readStripeReceiptUrl({ data: { commandRef: row.commandRef } })
            if (result.kind === 'refused') throw new Error(result.code)
            window.open(result.receiptUrl, '_blank', 'noopener,noreferrer')
          }}
        />
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
