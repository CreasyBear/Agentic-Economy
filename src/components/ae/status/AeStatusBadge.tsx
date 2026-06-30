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

type AeStatusBadgeAudience = 'public' | 'operator'

type AeStatusBadgeProps = {
  status: AeStatus
  /**
   * `public` (default) hides operator-only labels. `registry_verified` renders
   * as the plain "Checked" on public surfaces; the "Registry verified" / "Verified"
   * wording only appears on operator surfaces (DESIGN.md §7, §13).
   */
  audience?: AeStatusBadgeAudience
}

const publicLabelOverrides: Partial<Record<AeStatus, string>> = {
  registry_verified: 'Checked',
}

export function AeStatusBadge({ status, audience = 'public' }: AeStatusBadgeProps) {
  const presentation = getStatusPresentation(status)
  const label =
    audience === 'public' && publicLabelOverrides[status] !== undefined
      ? (publicLabelOverrides[status] as string)
      : presentation.label

  return (
    <span
      className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
      data-audience={presentation.audience}
      data-priority={presentation.priority}
      data-publicness={presentation.publicness}
      data-tone={presentation.tone}
    >
      <Badge className="ae-status-badge" data-tone={presentation.tone} variant={toneVariants[presentation.tone]}>
        {label}
      </Badge>
      <span data-slot="status-description" className="min-w-0 text-pretty text-sm leading-6 text-muted-foreground">
        {presentation.description}
      </span>
    </span>
  )
}
