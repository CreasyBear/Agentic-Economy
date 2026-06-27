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
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge variant={toneVariants[presentation.tone]}>{presentation.label}</Badge>
      <span className="text-sm text-muted-foreground">{presentation.description}</span>
    </span>
  )
}

