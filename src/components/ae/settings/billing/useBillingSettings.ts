import { useCallback, useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readOwnerSpendServer } from '@/lib/server/call-history.functions'
import { renderOwnerMoneyDocumentServer } from '@/lib/server/money-documents.functions'
import {
  readStripeReceiptUrlServer,
} from '@/modules/money/money.functions'
import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'

function useBillingAuthenticated() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  return isAuthenticated && !isLoading
}

export function useBillingReceipts() {
  const authenticated = useBillingAuthenticated()
  const invoiceHistoryRead = usePaginatedQuery(
    api.moneyAccountFunding.listOwnerInvoiceHistory,
    authenticated ? {} : 'skip',
    { initialNumItems: 20 },
  )
  const renderDocument = useServerFn(renderOwnerMoneyDocumentServer)
  const readStripeReceiptUrl = useServerFn(readStripeReceiptUrlServer)
  return {
    invoiceHistoryRows: invoiceHistoryRead.results as readonly AeInvoiceHistoryRow[],
    invoiceHistoryLoading: invoiceHistoryRead.status === 'LoadingFirstPage',
    invoiceHistoryHasMore: invoiceHistoryRead.status === 'CanLoadMore',
    invoiceHistoryLoadingMore: invoiceHistoryRead.status === 'LoadingMore',
    onLoadMore: () => invoiceHistoryRead.loadMore(20),
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
  const monthlySpendBudgetRead = useQuery(
    api.moneyMonthlySpendBudget.readMonthlySpendBudget,
    authenticated ? {} : 'skip',
  )
  const configureMonthlySpendBudget = useMutation(api.moneyMonthlySpendBudget.configureMonthlySpendBudget)
  const [monthSpend, setMonthSpend] = useState<Readonly<{ kind: 'available' | 'empty' | 'unavailable'; spendUnits?: string }>>({ kind: 'unavailable' })

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
    monthlySpendCeilingSettings: monthlySpendBudgetRead === undefined ? undefined : {
      enabled: monthlySpendBudgetRead.enabled,
      ceilingUnits: monthlySpendBudgetRead.ceilingUnits,
      revision: monthlySpendBudgetRead.revision,
    },
    monthSpend,
    onSaveMonthlySpendCeiling: async (settings: Readonly<{ enabled: boolean; ceilingUnits: string; expectedRevision: number }>) => {
      const correlationRef = `owner-settings:monthly-spend-ceiling:${crypto.randomUUID()}`
      await configureMonthlySpendBudget({ ...settings, correlationRef, idempotencyRef: correlationRef })
      await loadMonthlySpend()
    },
  }
}
