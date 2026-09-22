import { timestampIso } from '@/lib/ui/format-time'
import {
  aeStatusValues,
  getStatusPresentation,
  type AeStatus,
} from '@/lib/ui/status-presentation'
import type { AdminProviderRow, AdminProviderRowModel } from './providers-list.contracts'

const statusByValue: Partial<Record<string, AeStatus>> = Object.fromEntries(
  aeStatusValues.map((status) => [status, status]),
)
const perthTimestampFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Australia/Perth',
})

export function providerRowModel(row: AdminProviderRow): AdminProviderRowModel {
  return {
    slug: row.slug,
    href: `/admin/providers/${encodeURIComponent(row.slug)}`,
    publicStatusLabel: providerListStatusLabel(row.publicStatus),
    trustTierLabel: providerListStatusLabel(row.trustTier),
    updatedAtLabel: perthTimestampFormatter.format(row.updatedAt),
    updatedAtIso: timestampIso(row.updatedAt),
  }
}

function providerListStatusLabel(value: string): string {
  const status = statusByValue[value]
  if (status !== undefined) return getStatusPresentation(status).label
  const words = value.replaceAll('_', ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}
