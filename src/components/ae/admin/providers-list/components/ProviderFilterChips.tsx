import { Button } from '@/components/ui/button'
import {
  PROVIDERS_LIST_COPY,
  type ProviderFilterChipsProps,
} from '../providers-list.contracts'

export function ProviderFilterChips({ filter, onChange }: ProviderFilterChipsProps) {
  return (
    <div className="flex min-h-touch flex-wrap items-center gap-intra">
      <Button
        type="button"
        variant={filter === 'suppressed' ? 'secondary' : 'outline'}
        onClick={() => onChange('suppressed')}
      >
        {PROVIDERS_LIST_COPY.suppressed}
      </Button>
      {filter === 'suppressed' ? (
        <Button type="button" variant="ghost" onClick={() => onChange('all')}>
          {PROVIDERS_LIST_COPY.clearAll}
        </Button>
      ) : null}
    </div>
  )
}
