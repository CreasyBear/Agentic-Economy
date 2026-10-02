import { Button as ArcButton } from '@/components/arc/button/button'
import '../../OperatorScopesComposition.css'
import {
  PROVIDERS_LIST_COPY,
  type ProviderFilterChipsProps,
} from '../providers-list.contracts'

export function ProviderFilterChips({ filter, onChange }: ProviderFilterChipsProps) {
  return (
    <div className="arc-market arc-operator-provider-scope">
      <ArcButton
        type="button"
        variant="secondary"
        size="md"
        aria-pressed={filter === 'suppressed'}
        onClick={() => onChange('suppressed')}
      >
        {PROVIDERS_LIST_COPY.suppressed}
      </ArcButton>
      {filter === 'suppressed' ? (
        <ArcButton type="button" variant="ghost" size="md" onClick={() => onChange('all')}>
          {PROVIDERS_LIST_COPY.clearAll}
        </ArcButton>
      ) : null}
    </div>
  )
}
