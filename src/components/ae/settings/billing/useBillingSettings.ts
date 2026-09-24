import { useCallback, useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readOwnerSpendServer } from '@/lib/server/call-history.functions'
import { renderOwnerMoneyDocumentServer } from '@/lib/server/money-documents.functions'
import {
  createStripeCustomerPortalSessionServer,
  readAccountFundingBalanceServer,
  readSavedPaymentMethodSummaryServer,
  readStripeReceiptUrlServer,
} from '@/modules/money/money.functions'
import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'
import { paymentCardExpiryKind, type SavedPaymentMethodsSummary } from '@/modules/money/saved-payment-methods.view-model'

function useBillingAuthenticated() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  return isAuthenticated && !isLoading
}

export function useBillingPaymentMethods() {
  const authenticated = useBillingAuthenticated()
  const readSummary = useServerFn(readSavedPaymentMethodSummaryServer)
  const createPortalSession = useServerFn(createStripeCustomerPortalSessionServer)
  const [summary, setSummary] = useState<SavedPaymentMethodsSummary>()
  const [isLoading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const refresh = useCallback(async () => {
    setLoading(true)
    setUnavailable(false)
    try {
      const result = await readSummary()
      if (result.kind === 'refused') {
        setSummary(undefined)
        setUnavailable(true)
      } else {
        setSummary(result.kind === 'ready' && result.hasPaymentMethod
          ? { kind: 'ready', hasPaymentMethod: true, card: result.card }
          : { kind: 'missing', hasPaymentMethod: false })
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setSummary(undefined)
      setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [readSummary])
  useEffect(() => { if (authenticated) void refresh() }, [authenticated, refresh])
  return {
    summary,
    expiryKind: summary?.kind === 'ready' ? paymentCardExpiryKind(summary.card, Date.now()) : null,
    isLoading,
    unavailable,
    refresh,
    onManage: async () => {
      const result = await createPortalSession()
      if (result.kind === 'refused') throw new Error(result.code)
      return { portalUrl: result.portalUrl }
    },
  }
}

export function useBillingReceipts() {
  const authenticated = useBillingAuthenticated()
  const invoiceHistoryRead = useQuery(
    api.moneyAccountFunding.listOwnerInvoiceHistory,
    authenticated ? {} : 'skip',
  )
  const renderDocument = useServerFn(renderOwnerMoneyDocumentServer)
  const readStripeReceiptUrl = useServerFn(readStripeReceiptUrlServer)
  return {
    invoiceHistoryRows: invoiceHistoryRead?.page as readonly AeInvoiceHistoryRow[] | undefined,
    invoiceHistoryLoading: invoiceHistoryRead === undefined,
    onDownloadTaxInvoice: async (row: AeInvoiceHistoryRow) => {
      const documentRef = row.taxInvoice?.kind === 'issued' ? row.taxInvoice.documentRef : undefined
      if (documentRef === undefined) return
      const url = await renderDocument({ data: { documentRef } })
      if (url === null) throw new Error('money_document_url_unavailable')
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    onViewStripeReceipt: async (row: AeInvoiceHistoryRow) => {
      const result = await readStripeReceiptUrl({ data: { commandRef: row.commandRef } })
      if (result.kind === 'refused') throw new Error(result.code)
      window.open(result.receiptUrl, '_blank', 'noopener,noreferrer')
    },
  }
}

export function useBillingSpending() {
  const authenticated = useBillingAuthenticated()
  const autoRechargeRead = useQuery(
    api.moneyAutoRecharge.readAutoRechargeSettings,
    authenticated ? {} : 'skip',
  )
  const monthlySpendBudgetRead = useQuery(
    api.moneyMonthlySpendBudget.readMonthlySpendBudget,
    authenticated ? {} : 'skip',
  )
  const configureAutoRecharge = useMutation(api.moneyAutoRecharge.configureAutoRecharge)
  const configureMonthlySpendBudget = useMutation(api.moneyMonthlySpendBudget.configureMonthlySpendBudget)
  const readSummary = useServerFn(readSavedPaymentMethodSummaryServer)
  const readBalance = useServerFn(readAccountFundingBalanceServer)
  const [mandateState, setMandateState] = useState<'missing' | 'ready' | 'authentication_required' | 'failed'>('missing')
  const [pendingTopup, setPendingTopup] = useState<Readonly<{ commandRef: string }> | null>()
  const [monthSpend, setMonthSpend] = useState<Readonly<{ kind: 'available' | 'empty' | 'unavailable'; spendUnits?: string }>>({ kind: 'unavailable' })

  useEffect(() => {
    if (!authenticated) return
    void readSummary().then((result) => {
      setMandateState(result.kind === 'refused' ? 'missing' : result.mandateState)
    }).catch((cause: unknown) => captureClientExceptionOnClient(cause))
    void readBalance().then((result) => {
      if (result.kind === 'available') setPendingTopup(result.pendingTopup)
    }).catch((cause: unknown) => captureClientExceptionOnClient(cause))
  }, [authenticated, readSummary, readBalance])

  const loadMonthlySpend = useCallback(async () => {
    if (monthlySpendBudgetRead?.enabled !== true) {
      setMonthSpend({ kind: 'empty' })
      return
    }
    try {
      const periodStart = new Date().toISOString().slice(0, 7)
      const spend = await readOwnerSpendServer({ data: { dimensionKind: 'account', periodKind: 'month', periodStart } })
      if (spend.kind === 'available') setMonthSpend({ kind: 'available', spendUnits: spend.spendUnits })
      else if (spend.kind === 'empty') setMonthSpend({ kind: 'empty', spendUnits: '0' })
      else setMonthSpend({ kind: 'unavailable' })
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setMonthSpend({ kind: 'unavailable' })
    }
  }, [monthlySpendBudgetRead?.enabled])
  useEffect(() => { void loadMonthlySpend() }, [loadMonthlySpend])

  return {
    autoRechargeSettings: autoRechargeRead === undefined ? undefined : {
      enabled: autoRechargeRead.enabled,
      thresholdUnits: autoRechargeRead.thresholdUnits,
      rechargeAmountUnits: autoRechargeRead.rechargeAmountUnits,
      revision: autoRechargeRead.revision,
    },
    monthlySpendCeilingSettings: monthlySpendBudgetRead === undefined ? undefined : {
      enabled: monthlySpendBudgetRead.enabled,
      ceilingUnits: monthlySpendBudgetRead.ceilingUnits,
      revision: monthlySpendBudgetRead.revision,
    },
    mandateState,
    pendingTopup,
    monthSpend,
    onSaveAutoRecharge: async (settings: Readonly<{ enabled: boolean; thresholdUnits: string; rechargeAmountUnits: string; expectedRevision: number }>) => {
      const correlationRef = `owner-settings:auto-recharge:${crypto.randomUUID()}`
      await configureAutoRecharge({ ...settings, correlationRef, idempotencyRef: correlationRef })
    },
    onSaveMonthlySpendCeiling: async (settings: Readonly<{ enabled: boolean; ceilingUnits: string; expectedRevision: number }>) => {
      const correlationRef = `owner-settings:monthly-spend-ceiling:${crypto.randomUUID()}`
      await configureMonthlySpendBudget({ ...settings, correlationRef, idempotencyRef: correlationRef })
      await loadMonthlySpend()
    },
  }
}
