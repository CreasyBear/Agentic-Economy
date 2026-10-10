import { adminObjectHref } from '@/lib/operator/admin-console/contracts'
import { providerStatusLabel } from '@/lib/operator/admin-console/status-adapter'
import { timestampIso } from '@/lib/ui/format-time'
import { parseBusinessSlug } from '@/modules/business/public'
import type { AdminProviderRow, AdminProviderRowModel } from './providers-list.contracts'


export function providerRowModel(row: AdminProviderRow): AdminProviderRowModel {
  const parsed = parseBusinessSlug(row.slug)
  return {
    slug: row.slug,
    href: parsed.kind === 'valid'
      ? adminObjectHref({ kind: 'provider', ref: parsed.slug })
      : `/admin/providers/${encodeURIComponent(row.slug)}`,
    publicStatus: row.publicStatus,
    trustTierLabel: providerStatusLabel(row.trustTier),
    updatedAtIso: timestampIso(row.updatedAt),
  }
}
