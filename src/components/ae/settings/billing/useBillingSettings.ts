import { useCallback, useEffect, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readOwnerSpendServer } from '@/lib/server/call-history.functions'
import { readOwnerMoneyDocumentUrlServer } from '@/lib/server/money-documents.functions'
import {
  readStripeReceiptUrlServer,
} from '@/modules/money/money.functions'
import type { AeInvoiceHistoryRow, InvoiceDownloadOptions } from '@/modules/money/invoice-history.view-model'

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
  const readDocumentUrl = useServerFn(readOwnerMoneyDocumentUrlServer)
  const issueTaxInvoice = useMutation(api.moneyDocuments.issueOwnerFundingTaxInvoice)
  const readStripeReceiptUrl = useServerFn(readStripeReceiptUrlServer)
  return {
    invoiceHistoryRows: invoiceHistoryRead.results as readonly AeInvoiceHistoryRow[],
    invoiceHistoryLoading: invoiceHistoryRead.status === 'LoadingFirstPage',
    invoiceHistoryHasMore: invoiceHistoryRead.status === 'CanLoadMore',
    invoiceHistoryLoadingMore: invoiceHistoryRead.status === 'LoadingMore',
    onLoadMore: () => invoiceHistoryRead.loadMore(20),
    onGenerateTaxInvoice: async (row: AeInvoiceHistoryRow) => {
      const result = await issueTaxInvoice({ commandRef: row.commandRef })
      const status = result.taxInvoice.kind === 'issued' ? result.adjustmentNote ?? result.taxInvoice : result.taxInvoice
      if (status.kind === 'withheld') throw new Error(status.reason)
    },
    onDownloadTaxInvoice: async (row: AeInvoiceHistoryRow, options?: InvoiceDownloadOptions) => {
      const status = options?.document === 'adjustment' ? row.adjustmentNote : row.taxInvoice
      const documentRef = status?.kind === 'issued' ? status.documentRef : undefined
      if (documentRef === undefined) return
      const url = await readDocumentUrl({ data: { documentRef, format: options?.format ?? 'html' } })
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
  const monthlySpendRequest = useRef(0)

  const loadMonthlySpend = useCallback(async () => {
    const request = ++monthlySpendRequest.current
    if (monthlySpendBudgetRead?.enabled !== true) {
      setMonthSpend({ kind: 'empty' })
      return
    }
    try {
      const periodStart = new Date().toISOString().slice(0, 7)
      const spend = await readOwnerSpendServer({ data: { dimensionKind: 'account', periodKind: 'month', periodStart } })
      if (request !== monthlySpendRequest.current) return
      if (spend.kind === 'available') setMonthSpend({ kind: 'available', spendUnits: spend.spendUnits })
      else if (spend.kind === 'empty') setMonthSpend({ kind: 'empty', spendUnits: '0' })
      else setMonthSpend({ kind: 'unavailable' })
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      if (request === monthlySpendRequest.current) setMonthSpend({ kind: 'unavailable' })
    }
  }, [monthlySpendBudgetRead?.enabled])
  useEffect(() => {
    void loadMonthlySpend()
    return () => { monthlySpendRequest.current += 1 }
  }, [loadMonthlySpend])

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
