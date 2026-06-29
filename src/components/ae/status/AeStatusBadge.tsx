import { Badge } from '@/components/ui/badge'
import { getStatusPresentation, type AeStatus, type AeTone } from '@/lib/ui/status-presentation'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const toneVariants = {
  neutral: 'outline',
  info: 'secondary',
  success: 'secondary',
  warning: 'outline',
  danger: 'destructive',
} satisfies Record<AeTone, BadgeVariant>

type AeStatusBadgeProps = {
  status: AeStatus
}

export function AeStatusBadge({ status }: AeStatusBadgeProps) {
  const presentation = getStatusPresentation(status)

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Badge className="ae-status-badge" data-tone={presentation.tone} variant={toneVariants[presentation.tone]}>
        {presentation.label}
      </Badge>
      <span className="min-w-0 text-pretty text-sm leading-6 text-muted-foreground">{presentation.description}</span>
    </span>
  )
}
