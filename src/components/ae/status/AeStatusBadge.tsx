import { CircleAlert, CircleCheck, CircleX, Circle, LoaderCircle, type LucideIcon } from 'lucide-react'
import { getStatusPresentation, type AeStatus, type AeTone } from '@/lib/ui/status-presentation'
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

const toneIcons: Record<AeTone, { icon: LucideIcon; colour: string }> = {
  success: { icon: CircleCheck, colour: 'text-success' },
  info: { icon: Circle, colour: 'text-muted-foreground' },
  neutral: { icon: Circle, colour: 'text-muted-foreground' },
  warning: { icon: CircleAlert, colour: 'text-warning' },
  danger: { icon: CircleX, colour: 'text-danger' },
}

export function AeStatusBadge({ status, audience = 'public', density = 'default' }: AeStatusBadgeProps) {
  const presentation = getStatusPresentation(status)
  const label = audience === 'public' ? (publicLabelOverrides[status] ?? presentation.label) : presentation.label
  const { icon: Icon, colour } = status === 'call_working' ? { icon: LoaderCircle, colour: 'text-muted-foreground motion-safe:animate-spin' } : toneIcons[presentation.tone]

  return (
    <span className="arc-market arc-status-badge" data-audience={presentation.audience} data-priority={presentation.priority} data-publicness={presentation.publicness} data-tone={presentation.tone}>
      <span data-slot="status-label" data-density={density} className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Icon size={16} aria-hidden="true" className={colour} />
        {label}
      </span>
      {density === 'cell' ? null : (
        <span data-slot="status-description">{presentation.description}</span>
      )}
    </span>
  )
}
