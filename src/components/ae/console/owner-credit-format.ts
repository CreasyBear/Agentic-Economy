import { formatTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { MoneyDocumentView } from '@/lib/server/money-documents.functions'
import {
  formatDisplayAmount,
  type AccountHistoryEntry,
  type ExactAmount,
} from '@/modules/money/public'

export function documentKindLabel(kind: MoneyDocumentView['kind']): string {
  switch (kind) {
    case 'funding_receipt': return 'Funding receipt'
    case 'service_fee_document': return 'Service fee document'
    case 'statement': return 'Statement'
    case 'daily_close': return 'Daily close'
    case 'adjustment': return 'Adjustment document'
    case 'tax_invoice': return 'Tax invoice'
  }
}

export function documentStatusLabel(state: MoneyDocumentView['state']): string {
  return state === 'issued'
    ? 'Ready'
    : state === 'awaiting_signature'
      ? 'Awaiting owner signature'
      : state === 'failed'
        ? getStatusPresentation('needs_attention').label
        : 'Preparing'
}

export function documentTimeFact(document: MoneyDocumentView): { label: string; value: string; mono: true } {
  const value = formatTimestamp(document.createdAt)
  switch (document.state) {
    case 'issued':
      return { label: 'Issued', value, mono: true }
    case 'building':
    case 'adjusting':
    case 'rendering':
    case 'awaiting_signature':
    case 'failed':
      return { label: 'Recorded', value, mono: true }
    default: {
      const _exhaustive: never = document.state
      return _exhaustive
    }
  }
}

export function documentFacts(document: MoneyDocumentView) {
  return [
    { label: 'Document', value: documentKindLabel(document.kind) },
    { label: 'Amount', value: formatCreditAmount({ currency: 'AUD', exponent: 6, units: document.amountUnits }), mono: true as const },
    documentTimeFact(document),
    { label: 'Status', value: documentStatusLabel(document.state) },
    { label: 'Source records', value: String(document.sourceCount), mono: true as const },
    { label: 'Reference', value: document.documentRef, mono: true as const },
  ]
}

export function deduplicateHistory(
  current: readonly AccountHistoryEntry[],
  incoming: readonly AccountHistoryEntry[],
): readonly AccountHistoryEntry[] {
  const seen = new Set(current.map((entry) => entry.transactionId))
  return [...current, ...incoming.filter((entry) => {
    if (seen.has(entry.transactionId)) return false
    seen.add(entry.transactionId)
    return true
  })]
}

export function accountHistoryLabel(kind: AccountHistoryEntry['kind']): string {
  switch (kind) {
    case 'funding': return 'Credit added'
    case 'funding_reversal': return 'Credit reversed'
    case 'call_spend': return 'Call purchase'
    case 'document_adjustment': return 'Document adjustment'
    case 'unmapped': return 'Account movement'
  }
}

export function formatSignedAmount(amount: ExactAmount): string {
  const units = BigInt(amount.units)
  const formatted = formatDisplayAmount({ ...amount, units: (units < 0n ? -units : units).toString() })
  return units > 0n ? `+${formatted}` : units < 0n ? `−${formatted}` : formatted
}

export function formatCreditAmount(amount: ExactAmount | undefined): string {
  return amount === undefined ? 'Amount unknown' : formatDisplayAmount(amount)
}
