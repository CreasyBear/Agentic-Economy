import type { AccountHistoryEntry } from '@/modules/money/public'

export function AccountHistorySourceLink({ entry }: Readonly<{ entry: AccountHistoryEntry }>) {
  if (entry.kind === 'call_spend' && entry.sourceRef !== null) {
    return (
      <a href={`/calls/${encodeURIComponent(entry.sourceRef)}`} className="w-fit text-xs font-medium text-primary hover:underline"
        aria-label={`View Call receipt ${entry.sourceRef}`}>
        View Call receipt
      </a>
    )
  }
  if (entry.kind === 'funding' && entry.sourceRef !== null) {
    return (
      <a href={`/owner/settings/receipts#funding-receipt-${encodeURIComponent(entry.sourceRef)}`} className="w-fit text-xs font-medium text-primary hover:underline"
        aria-label={`View funding receipt ${entry.sourceRef}`}>
        View funding receipt
      </a>
    )
  }
  return null
}
