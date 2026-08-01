import { cn } from '@/lib/utils'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export type AeRadioCardOption = {
  value: string
  label: string
  description?: string
}

type AeRadioCardGroupProps = {
  value: string
  options: readonly AeRadioCardOption[]
  disabled?: boolean
  name?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  onValueChange: (value: string) => void
}

export function AeRadioCardGroup({
  value,
  options,
  disabled = false,
  name,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid = false,
  onValueChange,
}: AeRadioCardGroupProps) {
  return (
    <FieldGroup className="grid gap-2" {...(ariaInvalid ? { 'data-invalid': true } : {})}>
      <RadioGroup
        {...(name === undefined ? {} : { name })}
        value={value}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-disabled={disabled || undefined}
        className="grid gap-2"
        onValueChange={onValueChange}
      >
        {options.map((option) => {
          const selected = option.value === value
          return (
            <Field key={option.value} orientation="horizontal" className="gap-0" {...(ariaInvalid ? { 'data-invalid': true } : {})} {...(disabled ? { 'data-disabled': true } : {})}>
              <FieldLabel
                htmlFor={option.value}
                className={cn(
                  'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 text-left text-sm motion-safe:transition motion-safe:duration-150 hover:bg-muted hover:shadow-low',
                  selected && 'border-primary bg-muted shadow-low',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <RadioGroupItem
                  id={option.value}
                  value={option.value}
                  aria-describedby={ariaDescribedBy}
                  aria-invalid={ariaInvalid || undefined}
                  className="mt-1"
                />
                <span className="grid gap-1">
                  <span className="font-medium text-foreground">{option.label}</span>
                  {option.description === undefined ? null : <span className="text-muted-foreground">{option.description}</span>}
                </span>
              </FieldLabel>
            </Field>
          )
        })}
      </RadioGroup>
    </FieldGroup>
  )
}
