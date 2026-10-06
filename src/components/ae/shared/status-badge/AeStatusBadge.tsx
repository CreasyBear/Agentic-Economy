import { Badge } from '@/components/arc/badge/badge'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { AeStatusBadgeProps } from './status-badge.contracts'

export function AeStatusBadge({ status, compact = false, size, className }: AeStatusBadgeProps) {
  const presentation = getStatusPresentation(status)

  return (
    <Badge tone={presentation.tone} {...(size === undefined ? {} : { size })} {...(className === undefined ? {} : { className })}>
      {compact ? presentation.compactLabel : presentation.label}
    </Badge>
  )
}
