import { Badge } from '@/components/arc/badge/badge'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { providerStatusLabel, providerStatusPresentation } from '@/lib/operator/admin-console/status-adapter'
import type { AeStatus } from '@/lib/ui/status-presentation'

export function ProviderStatusBadge({ value }: Readonly<{ value: string }>) {
  if (providerStatusPresentation(value)) return <AeStatusBadge status={value as AeStatus} audience="operator" density="cell" />
  return <Badge tone="neutral" size="sm">{providerStatusLabel(value)}</Badge>
}
