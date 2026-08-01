import { cn } from '@/lib/utils'

export type AeRadioCardOption = {
  value: string
  label: string
  description?: string
}

export function AeRadioCardGroup({ value, options, disabled = false, name, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, onValueChange }: { value: string; options: readonly AeRadioCardOption[]; disabled?: boolean; name?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; onValueChange: (value: string) => void }) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-describedby={ariaDescribedBy} aria-invalid={ariaInvalid || undefined} aria-disabled={disabled || undefined}>
      {options.map((option) => {
        const selected = option.value === value
        return (
        <label key={option.value} htmlFor={option.value} className={cn('flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 text-left text-sm motion-safe:transition motion-safe:duration-150 hover:bg-muted hover:shadow-low has-disabled:cursor-not-allowed has-disabled:opacity-50', selected && 'border-primary bg-muted shadow-low')}>
            <input
              id={option.value}
              name={name}
              type="radio"
              value={option.value}
              checked={selected}
              disabled={disabled}
              className="mt-1 size-3"
              onChange={() => onValueChange(option.value)}
            />
            <span className="grid gap-1">
              <span className="font-medium text-foreground">{option.label}</span>
              {option.description === undefined ? null : <span className="text-muted-foreground">{option.description}</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}
