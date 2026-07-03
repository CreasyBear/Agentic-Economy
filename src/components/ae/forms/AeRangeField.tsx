import { Slider } from '@astryxdesign/core/Slider'

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
  const numericValue = normalize(value, min, max)

  return (
    <>
      {name === undefined ? null : <input type="hidden" name={name} value={String(numericValue)} />}
      <Slider
        label={label}
        {...(description === undefined ? {} : { description })}
        value={numericValue}
        min={min}
        max={max}
        step={step}
        isDisabled={disabled}
        isOptional
        valueDisplay="text"
        formatValue={(minutes) => `${minutes} minutes`}
        {...(errorMessage === undefined ? {} : { status: { type: 'error' as const, message: errorMessage } })}
        onChange={(next: number) => onValueChange(String(next))}
      />
    </>
  )
}

function normalize(value: string, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 30
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}
