import { Badge } from '@/components/ui/badge'
import { aeStatusToneVariants, getStatusPresentation, type AeStatus } from '@/lib/ui/status-presentation'
import './StatusComposition.css'

type AeStatusBadgeAudience = 'public' | 'operator'
type AeStatusBadgeDensity = 'default' | 'cell'

type AeStatusBadgeProps = {
  status: AeStatus
  audience?: AeStatusBadgeAudience
  density?: AeStatusBadgeDensity
}

const publicLabelOverrides: Partial<Record<AeStatus, string>> = {
  registry_verified: 'Checked',
}

export function AeStatusBadge({ status, audience = 'public', density = 'default' }: AeStatusBadgeProps) {
  const presentation = getStatusPresentation(status)
  const label = audience === 'public' ? (publicLabelOverrides[status] ?? presentation.label) : presentation.label

  return (
    <span className="arc-market arc-status-badge" data-audience={presentation.audience} data-priority={presentation.priority} data-publicness={presentation.publicness} data-tone={presentation.tone}>
      <Badge variant={aeStatusToneVariants[presentation.tone]}>{label}</Badge>
      {density === 'cell' ? null : (
        <span data-slot="status-description">{presentation.description}</span>
      )}
    </span>
  )
}
