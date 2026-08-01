import { Badge } from '@/components/ui/badge'
import { getStatusPresentation, type AeStatus, type AeTone } from '@/lib/ui/status-presentation'

type BadgeVariant = 'outline' | 'secondary' | 'default' | 'destructive'

const toneVariants = {
  neutral: 'outline',
  info: 'secondary',
  success: 'default',
  warning: 'outline',
  danger: 'destructive',
} satisfies Record<AeTone, BadgeVariant>

type AeStatusBadgeAudience = 'public' | 'operator'

type AeStatusBadgeProps = {
  status: AeStatus
  audience?: AeStatusBadgeAudience
}

const publicLabelOverrides: Partial<Record<AeStatus, string>> = {
  registry_verified: 'Checked',
}

export function AeStatusBadge({ status, audience = 'public' }: AeStatusBadgeProps) {
  const presentation = getStatusPresentation(status)
  const label = audience === 'public' ? (publicLabelOverrides[status] ?? presentation.label) : presentation.label

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" data-audience={presentation.audience} data-priority={presentation.priority} data-publicness={presentation.publicness} data-tone={presentation.tone}>
      <Badge variant={toneVariants[presentation.tone]}>{label}</Badge>
      <span className="text-sm text-muted-foreground" data-slot="status-description">{presentation.description}</span>
    </span>
  )
}
