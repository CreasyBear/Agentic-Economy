import type { AccountHistoryEntry } from '@/modules/money/public'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export function AccountHistorySourceLink({ entry }: Readonly<{ entry: AccountHistoryEntry }>) {
  if ((entry.kind === 'call_spend' || entry.kind === 'promotional_use' || entry.kind === 'call_refund' || entry.kind === 'promotional_refund') && entry.sourceRef !== null) {
    return (
      <a href={`/calls/${encodeURIComponent(entry.sourceRef)}`} className={`arc-market ${actionLinkClassName('ghost', 'md')}`}
        aria-label={`View Call receipt ${entry.sourceRef}`}>
        View Call receipt
      </a>
    )
  }
  if (entry.kind === 'funding' && entry.sourceRef !== null) {
    return (
      <a href={`/owner/settings/receipts#funding-receipt-${encodeURIComponent(entry.sourceRef)}`} className={`arc-market ${actionLinkClassName('ghost', 'md')}`}
        aria-label={`View funding receipt ${entry.sourceRef}`}>
        View funding receipt
      </a>
    )
  }
  return null
}
