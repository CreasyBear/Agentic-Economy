import { Badge } from '@/components/arc/badge/badge'
import { providerStatusLabel, providerStatusPresentation } from '@/lib/operator/admin-console/status-adapter'

export function ProviderStatusBadge({ value }: Readonly<{ value: string }>) {
  return <Badge tone={providerStatusPresentation(value)?.tone ?? 'neutral'} size="sm">{providerStatusLabel(value)}</Badge>
}
