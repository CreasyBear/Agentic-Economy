import { Button as ArcButton } from '@/components/arc/button/button'
import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import '../../OperatorScopesComposition.css'
import {
  PROVIDERS_LIST_COPY,
  type ProviderFilterChipsProps,
} from '../providers-list.contracts'

const PROVIDER_FILTER_OPTIONS = [
  { value: 'suppressed', label: PROVIDERS_LIST_COPY.suppressed },
]
const ALL_PROVIDER_FILTERS: string[] = [];
const SUPPRESSED_PROVIDER_FILTER = ['suppressed'];

export function ProviderFilterChips({ filter, onChange }: ProviderFilterChipsProps) {
  return (
    <div className="arc-market arc-operator-provider-scope">
      <ChipGroup
        options={PROVIDER_FILTER_OPTIONS}
        value={filter === 'suppressed' ? SUPPRESSED_PROVIDER_FILTER : ALL_PROVIDER_FILTERS}
        onValueChange={values => onChange(values.length === 0 ? 'all' : 'suppressed')}
        label="Provider status"
        multiple={false}
      />
      {filter === 'suppressed' ? (
        <ArcButton type="button" variant="ghost" size="md" onClick={() => onChange('all')}>
          {PROVIDERS_LIST_COPY.clearAll}
        </ArcButton>
      ) : null}
    </div>
  )
}
