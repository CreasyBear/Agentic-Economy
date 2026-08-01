import { useId } from 'react'

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'

export function AeRangeField({
  name,
  label,
  description,
  value,
  min = 5,
  max = 180,
  step = 5,
  disabled = false,
  errorMessage,
  onValueChange,
}: {
  name?: string
  label: string
  description?: string
  value: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  errorMessage?: string
  onValueChange: (value: string) => void
}) {
  const controlId = useId()
  const labelId = `${controlId}-label`
  const descriptionId = `${controlId}-description`
  const errorId = `${controlId}-error`
  const numericValue = normalize(value, min, max)
  const describedBy = [description === undefined ? undefined : descriptionId, errorMessage === undefined ? undefined : errorId].filter((entry): entry is string => entry !== undefined).join(' ') || undefined

  return (
    <FieldGroup>
      {name === undefined ? null : <input type="hidden" name={name} value={String(numericValue)} />}
      <Field {...(errorMessage === undefined ? {} : { 'data-invalid': true })} {...(disabled ? { 'data-disabled': true } : {})}>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel id={labelId} htmlFor={controlId}>{label}</FieldLabel>
          <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">{numericValue} minutes</span>
        </div>
        {description === undefined ? null : <FieldDescription id={descriptionId}>{description}</FieldDescription>}
        <Slider
          id={controlId}
          value={[numericValue]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          {...(errorMessage === undefined ? {} : { 'aria-invalid': true })}
          onValueChange={(next) => {
            const nextValue = next[0]
            if (nextValue !== undefined) {
              onValueChange(String(nextValue))
            }
          }}
        />
        {errorMessage === undefined ? null : <FieldError id={errorId}>{errorMessage}</FieldError>}
      </Field>
    </FieldGroup>
  )
}

function normalize(value: string, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 30
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}
