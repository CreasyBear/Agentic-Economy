import { Badge } from '@/components/ui/badge'
import { getAeUiStatePresentation, type AeUiState, type AeUiStateTone } from '@/lib/ui/ui-state'
import '../layout/RouteRecoveryComposition.css'

type AeInlineStateProps = Readonly<{
  state: AeUiState
  label?: string
  description?: string
}>

const badgeVariantForTone: Record<AeUiStateTone, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  neutral: 'secondary',
  positive: 'success',
  warning: 'warning',
  danger: 'destructive',
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
      <Badge variant={badgeVariantForTone[presentation.tone]}>{label ?? presentation.label}</Badge>
      <span>{description ?? presentation.description}</span>
    </span>
  )
}
