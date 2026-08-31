import { Badge } from '@/components/ui/badge'
import { getAeUiStatePresentation, type AeUiState, type AeUiStateTone } from '@/lib/ui/ui-state'

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
      className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
      role={presentation.role}
      aria-live={presentation.live}
      data-ui-state={state}
    >
      <Badge variant={badgeVariantForTone[presentation.tone]}>{label ?? presentation.label}</Badge>
      <span>{description ?? presentation.description}</span>
    </span>
  )
}
