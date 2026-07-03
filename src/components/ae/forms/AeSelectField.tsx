import { Selector } from '@astryxdesign/core/Selector'

export type AeSelectOption = {
  value: string
  label: string
}

export type AeSelectFieldProps = {
  id: string
  name?: string
  value: string
  options: readonly AeSelectOption[]
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  placeholder?: string
  onValueChange: (value: string) => void
}

export function AeSelectField({
  id,
  name,
  value,
  options,
  disabled = false,
  invalid = false,
  describedBy,
  placeholder = 'Choose one',
  onValueChange,
}: AeSelectFieldProps) {
  return (
    <>
      {name === undefined ? null : <input type="hidden" name={name} value={value} />}
      <Selector
        id={id}
        label={placeholder}
        isLabelHidden
        value={value}
        options={options.map((option) => ({ value: option.value, label: option.label }))}
        isDisabled={disabled}
        placeholder={placeholder}
        onChange={onValueChange}
        {...(invalid ? { status: { type: 'error' } as const, 'aria-invalid': true } : {})}
        {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
      />
    </>
  )
}
