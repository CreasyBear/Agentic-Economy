import { Badge } from '@astryxdesign/core/Badge'
import { Text } from '@astryxdesign/core/Text'
import { getStatusPresentation, type AeStatus, type AeTone } from '@/lib/ui/status-presentation'

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error'

const toneVariants = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
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
  const label = audience === 'public' && publicLabelOverrides[status] !== undefined ? (publicLabelOverrides[status] as string) : presentation.label

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" data-audience={presentation.audience} data-priority={presentation.priority} data-publicness={presentation.publicness} data-tone={presentation.tone}>
      <Badge label={label} variant={toneVariants[presentation.tone]} />
      <Text type="supporting" color="secondary" data-slot="status-description">{presentation.description}</Text>
    </span>
  )
}
