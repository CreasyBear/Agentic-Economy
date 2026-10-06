import type { BadgeSize } from '@/components/arc/badge/badge'
import type { AeStatus } from '@/lib/ui/status-presentation'

export type AeStatusBadgeProps = Readonly<{
  status: AeStatus
  compact?: boolean
  size?: BadgeSize
  className?: string
}>
