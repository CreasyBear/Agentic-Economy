import { Button } from '@/components/ui/button'
import {
  ADMIN_EXCEPTION_FILTERS,
  ADMIN_EXCEPTIONS_COPY,
  type ExceptionFilterChipsProps,
} from '../exceptions.contracts'

export function ExceptionFilterChips({ selected, onSelect, onClear }: ExceptionFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-intra">
      {ADMIN_EXCEPTION_FILTERS.map((filter) => (
        <Button
          key={filter.label}
          type="button"
          size="sm"
          variant={selected === filter.kind ? 'default' : 'outline'}
          aria-pressed={selected === filter.kind}
          onClick={() => onSelect(filter.kind)}
        >
          {filter.label}
        </Button>
      ))}
      {selected === null ? null : (
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          {ADMIN_EXCEPTIONS_COPY.clearAll}
        </Button>
      )}
    </div>
  )
}
