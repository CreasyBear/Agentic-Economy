import { Badge } from '@/components/arc/badge/badge'
import { getAeUiStatePresentation, type AeUiState, type AeUiStateTone } from '@/lib/ui/ui-state'
import '../layout/RouteRecoveryComposition.css'

type AeInlineStateProps = Readonly<{
  state: AeUiState
  label?: string
  description?: string
}>

const badgeVariantForTone: Record<AeUiStateTone, 'neutral' | 'success' | 'warning' | 'danger'> = {
  neutral: 'neutral',
  positive: 'success',
  warning: 'warning',
  danger: 'danger',
}

export function AeInlineState({ state, label, description }: AeInlineStateProps) {
  const presentation = getAeUiStatePresentation(state)

  return (
    <span
      className="arc-market arc-inline-state"
      role={presentation.role}
      aria-live={presentation.live}
      data-ui-state={state}
    >
      <Badge tone={badgeVariantForTone[presentation.tone]}>{label ?? presentation.label}</Badge>
      <span>{description ?? presentation.description}</span>
    </span>
  )
}
